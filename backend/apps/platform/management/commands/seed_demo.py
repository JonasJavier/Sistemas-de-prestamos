"""Fictitious demo data (doc 10 - sections 3 and 5): kept for the whole project.

Creates, only if missing:
- the platform owner;
- «Financiera Modelo SRL» with one user per role, a funded cash box and
  three customers with valid cédulas;
- «Préstamos del Cibao SRL», a second tenant to show the isolation;
- a demo portfolio (phase 4): three disbursed loans — one in arrears, one
  just overdue, one current — assigned to the collector, added once to a
  demo company whose collector has no portfolio yet.

Every account uses the same development password and a verified email, so
the end-to-end tests and the phase demos can sign in. It refuses to run
against a non-DEBUG environment unless ``--allow-non-debug`` is given
(staging demos), and it never touches existing companies.
"""

import datetime as dt
import uuid
from decimal import Decimal

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Membership, Role, User
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.customers.models import Customer
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount
from apps.lending import applications as flow
from apps.lending.disbursement import disburse
from apps.lending.models import Installment, Loan, LoanProduct
from apps.platform.services import register_company

PASSWORD = "demo-cobradia-2026"  # noqa: S105 - fictitious, development only
OWNER_EMAIL = "dueno@cobradia.test"

DEMO_COMPANY = "Financiera Modelo SRL"
DEMO_STAFF = [  # (email, first name, last name, role)
    ("supervisor@modelo.test", "Samuel", "Supervisor", "Supervisor"),
    ("oficial@modelo.test", "Olga", "Oficial", "Oficial de crédito"),
    ("cajera@modelo.test", "Carolina", "Núñez", "Cajero"),
    ("cobrador@modelo.test", "Carlos", "Cobrador", "Cobrador"),
    ("contabilidad@modelo.test", "Cecilia", "Contable", "Contabilidad"),
]
DEMO_CUSTOMERS = [  # (first 10 digits of the cédula, names, phone, e-mail)
    ("0011234567", "María", "Gómez", "8095550101", "maria@cliente.test"),
    ("4022345678", "José", "Pérez Santana", "8295550102", "jose@cliente.test"),
    ("0013456789", "Ana Luisa", "Rodríguez", "8495550103", "analuisa@cliente.test"),
]
OTHER_COMPANY = "Préstamos del Cibao SRL"


def cedula(first_ten: str) -> str:
    """Appends the Luhn check digit of ``apps.customers.validators``."""
    total = 0
    for index, char in enumerate(first_ten):
        product = int(char) * (1 if index % 2 == 0 else 2)
        total += product - 9 if product > 9 else product
    return f"{first_ten}{(10 - total % 10) % 10}"


def verified_user(email: str, **fields) -> User:
    user = User.objects.create_user(email, PASSWORD, **fields)
    EmailAddress.objects.create(user=user, email=email, primary=True, verified=True)
    return user


class Command(BaseCommand):
    help = "Siembra datos ficticios de demostración (solo desarrollo y pruebas)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--allow-non-debug",
            action="store_true",
            help="Permite sembrar con DEBUG apagado (entorno de pruebas para demos).",
        )

    def handle(self, *args, **options) -> None:
        if not settings.DEBUG and not options["allow_non_debug"]:
            raise CommandError(
                "Con DEBUG apagado no se siembran datos ficticios; usa --allow-non-debug "
                "solo en el entorno de pruebas."
            )
        if not User.objects.filter(email=OWNER_EMAIL).exists():
            verified_user(
                OWNER_EMAIL, first_name="Jonas", last_name="Dueño", is_platform_admin=True
            )
            self.stdout.write(f"Dueño de la plataforma: {OWNER_EMAIL}")
        self._demo_company()
        self._demo_contacts()
        self._demo_portfolio()
        self._demo_collections()
        self._demo_finance()
        self._demo_scores()
        self._other_company()
        self.stdout.write(self.style.SUCCESS(f"Listo. Contraseña de todas las cuentas: {PASSWORD}"))

    @transaction.atomic
    def _demo_company(self) -> None:
        if Company.objects.filter(legal_name=DEMO_COMPANY).exists():
            self.stdout.write(f"«{DEMO_COMPANY}» ya existe: no se toca.")
            return
        reg = register_company(
            legal_name=DEMO_COMPANY,
            rnc="131234567",
            admin_email="gerente@modelo.test",
            admin_password=PASSWORD,
            admin_first_name="Gina",
            admin_last_name="Gerente",
        )
        EmailAddress.objects.create(
            user=reg.admin, email=reg.admin.email, primary=True, verified=True
        )
        today = timezone.localdate()
        with company_context(reg.company.id):
            for email, first_name, last_name, role in DEMO_STAFF:
                user = verified_user(
                    email, company=reg.company, first_name=first_name, last_name=last_name
                )
                Membership.objects.create(
                    company=reg.company,
                    user=user,
                    branch=reg.branch,
                    role=Role.objects.get(name=role),
                )
            ledger.capital_movement(
                account=FinancialAccount.objects.get(kind=FinancialAccount.Kind.CASH),
                amount=Decimal("500000"),
                increase=True,
                branch=reg.branch,
                on=today,
                note="Fondo inicial de la demostración",
                created_by=reg.admin,
            )
            for first_ten, first_name, last_name, phone, email in DEMO_CUSTOMERS:
                Customer.objects.create(
                    company=reg.company,
                    kind=Customer.Kind.PERSON,
                    document_type=Customer.DocumentType.CEDULA,
                    document_number=cedula(first_ten),
                    first_name=first_name,
                    last_name=last_name,
                    phone=phone,
                    email=email,
                    home_branch=reg.branch,
                )
        self.stdout.write(f"«{DEMO_COMPANY}»: gerente@modelo.test y un usuario por rol.")

    def _demo_contacts(self) -> None:
        """The portal sends its codes by e-mail (decision 099): demo data
        seeded before phase 9 gets the customers' addresses too."""
        company = Company.objects.filter(legal_name=DEMO_COMPANY).first()
        if company is None:
            return
        with company_context(company.id):
            for first_ten, *_, email in DEMO_CUSTOMERS:
                Customer.objects.filter(document_number=cedula(first_ten), email="").update(
                    email=email
                )

    def _demo_portfolio(self) -> None:
        """Loans to collect in the phase 4 demo: through the real services
        (application, approval, cash disbursement), then dated in the past."""
        company = Company.objects.filter(legal_name=DEMO_COMPANY).first()
        if company is None:
            return
        # Commit inside the tenant: what runs at commit (documents) needs it.
        with company_context(company.id), transaction.atomic():
            if Loan.objects.filter(collector__email="cobrador@modelo.test").exists():
                return
            from apps.cash import services as cash

            users = {u.email: u for u in User.objects.filter(company=company)}
            officer, supervisor = users["oficial@modelo.test"], users["supervisor@modelo.test"]
            cashier, collector = users["cajera@modelo.test"], users["cobrador@modelo.test"]
            branch = Membership.objects.filter(user=cashier).first().branch
            general = FinancialAccount.objects.get(kind=FinancialAccount.Kind.CASH, holder=None)
            session = cash.open_session(
                user=cashier, branch=branch, amount=Decimal("60000"), fund_from=general
            )
            san = LoanProduct.objects.get(name="Personal San (semanal)")
            fija = LoanProduct.objects.get(name="Cuota Fija (mensual)")
            plan = [  # (customer last name, product, amount, installments, first due in days)
                ("Gómez", san, Decimal("10000"), 8, -18),
                ("Pérez Santana", fija, Decimal("25000"), 12, -5),
                ("Rodríguez", san, Decimal("5000"), 4, 3),
            ]
            today = timezone.localdate()
            for last_name, product, amount, count, first_due_in in plan:
                customer = Customer.objects.get(last_name=last_name)
                application = flow.create_application(
                    user=officer,
                    customer=customer,
                    product=product,
                    amount=amount,
                    frequency=product.allowed_frequencies[-1],
                    installments=count,
                )
                application.requirements.update(verified_by=officer, verified_at=timezone.now())
                flow.submit(application, user=officer)
                flow.approve(application, user=supervisor)
                loan = disburse(
                    application=application,
                    user=cashier,
                    source_account=None,
                    method="cash",
                    idempotency_key=uuid.uuid4().hex,
                )
                step = 7 if product == san else 30
                first = today + dt.timedelta(days=first_due_in)
                for inst in loan.installments.order_by("number"):
                    due = first + dt.timedelta(days=step * (inst.number - 1))
                    Installment.objects.filter(pk=inst.pk).update(
                        due_date=due, original_due_date=due
                    )
                Loan.objects.filter(pk=loan.pk).update(
                    disbursed_on=first - dt.timedelta(days=step),
                    next_due_date=first,
                    collector=collector if product == san else None,
                )
            expected = cash.expected_cash(session)
            cash.close_session(
                session=session,
                user=cashier,
                counts={"1000": int(expected // 1000), "1": int(expected % 1000)},
                return_to=general,
                return_amount=expected,
            )
            cash.approve_session(session=session, user=supervisor)
            from apps.payments.tasks import run_nightly

            run_nightly(company.id, today)
        self.stdout.write("Cartera de demostración: 3 préstamos (uno atrasado) con cobrador.")

    def _demo_collections(self) -> None:
        """Phase 5 demo: a promise for today, one that is coming and a
        follow-up, through the real services (only once)."""
        company = Company.objects.filter(legal_name=DEMO_COMPANY).first()
        if company is None:
            return
        with company_context(company.id), transaction.atomic():
            from apps.collections import agenda
            from apps.collections.models import CollectionAction, PaymentPromise

            if PaymentPromise.objects.exists():
                return
            users = {u.email: u for u in User.objects.filter(company=company)}
            officer, collector = users["oficial@modelo.test"], users["cobrador@modelo.test"]
            late = Loan.objects.filter(collector=collector, days_past_due__gt=0).first()
            current = Loan.objects.filter(status=Loan.Status.ACTIVE, collector=None).first()
            if late is None or current is None:
                return
            today = timezone.localdate()
            agenda.record_action(
                loan=late,
                user=collector,
                kind=CollectionAction.Kind.VISIT,
                result=CollectionAction.Result.PROMISED,
                note="Cobra el viernes en el colmado",
                promise_on=today,
                promise_amount=Decimal("1000"),
            )
            agenda.record_action(
                loan=current,
                user=officer,
                kind=CollectionAction.Kind.CALL,
                result=CollectionAction.Result.PROMISED,
                note="Adelanta la cuota con la quincena",
                promise_on=today + dt.timedelta(days=3),
                promise_amount=Decimal("2500"),
            )
            agenda.record_action(
                loan=current,
                user=officer,
                kind=CollectionAction.Kind.MESSAGE,
                result=CollectionAction.Result.CONTACTED,
                note="Confirmar por WhatsApp que recibió el estado de cuenta",
                follow_up_on=today,
            )
        self.stdout.write("Cobranza de demostración: 2 promesas y un seguimiento para hoy.")

    def _demo_scores(self) -> None:
        """Phase 7: the classification the night would compute (decision 088)."""
        from apps.reports import scoring

        scored = 0
        for company in Company.objects.filter(legal_name=DEMO_COMPANY):
            with company_context(company.id), transaction.atomic():
                scored = scoring.refresh()
        self.stdout.write(f"Clasificación de clientes calculada ({scored}).")

    def _demo_finance(self) -> None:
        """Phase 6 demo: a bank funded from the general cash, two expenses
        and a rent paid monthly (through the real services, only once)."""
        company = Company.objects.filter(legal_name=DEMO_COMPANY).first()
        if company is None:
            return
        with company_context(company.id), transaction.atomic():
            from apps.expenses import payables
            from apps.expenses import services as expenses
            from apps.expenses.models import Expense, ExpenseCategory
            from apps.ledger import services as ledger

            if Expense.objects.exists():
                return
            manager = User.objects.get(email="gerente@modelo.test")
            branch = Membership.objects.filter(user=manager).first().branch
            general = FinancialAccount.objects.get(kind=FinancialAccount.Kind.CASH, holder=None)
            bank = FinancialAccount.objects.filter(kind=FinancialAccount.Kind.BANK).first()
            if bank is None:
                bank = ledger.create_financial_account(
                    company_id=company.id,
                    name="Banco Popular",
                    kind=FinancialAccount.Kind.BANK,
                    bank_name="Banco Popular Dominicano",
                    account_number="7801234567",
                )
            today = timezone.localdate()
            ledger.transfer(
                source=general,
                target=bank,
                amount=Decimal("50000"),
                branch=branch,
                on=today,
                note="Depósito de la caja general",
                created_by=manager,
            )
            categories = {c.name: c for c in ExpenseCategory.objects.all()}
            expenses.register(
                user=manager,
                kind="expense",
                date=today,
                branch=branch,
                category=categories["Luz, agua, teléfono e internet"],
                description="Factura de luz",
                amount=Decimal("3200"),
                itbis=Decimal("488.14"),
                method="transfer",
                account=bank,
                party_name="Edenorte Dominicana",
                party_document="101821248",
                ncf="B0100004567",
            )
            expenses.register(
                user=manager,
                kind="expense",
                date=today,
                branch=branch,
                category=categories["Materiales de oficina"],
                description="Resmas de papel y tinta",
                amount=Decimal("1850"),
                account=general,
                party_name="Papelería La Económica",
            )
            payables.create(
                user=manager,
                branch=branch,
                category=categories["Alquiler del local"],
                party_name="Inmobiliaria del Cibao",
                party_document="131234567",
                description="Alquiler del local",
                amount=Decimal("25000"),
                due_on=today.replace(day=1) + dt.timedelta(days=32),
                frequency="monthly",
                count=6,
            )
        self.stdout.write("Finanzas de demostración: banco, dos gastos y el alquiler mensual.")

    @transaction.atomic
    def _other_company(self) -> None:
        if Company.objects.filter(legal_name=OTHER_COMPANY).exists():
            return
        reg = register_company(
            legal_name=OTHER_COMPANY,
            admin_email="gerente@cibao.test",
            admin_password=PASSWORD,
            admin_first_name="Gabriel",
            admin_last_name="Cibao",
        )
        EmailAddress.objects.create(
            user=reg.admin, email=reg.admin.email, primary=True, verified=True
        )
        with company_context(reg.company.id):
            Customer.objects.create(
                company=reg.company,
                kind=Customer.Kind.PERSON,
                document_type=Customer.DocumentType.CEDULA,
                document_number=cedula("0315556667"),
                first_name="Rosa",
                last_name="Cibaeña",
                phone="8095550199",
                home_branch=reg.branch,
            )
        self.stdout.write(f"«{OTHER_COMPANY}»: gerente@cibao.test (para probar el aislamiento).")
