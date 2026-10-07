"""Fictitious demo data (doc 10 - sections 3 and 5): kept for the whole project.

Creates, only if missing:
- the platform owner;
- «Financiera Modelo SRL» with one user per role, a funded cash box and
  three customers with valid cédulas;
- «Préstamos del Cibao SRL», a second tenant to show the isolation.

Every account uses the same development password and a verified email, so
the end-to-end tests and the phase demos can sign in. It refuses to run
against a non-DEBUG environment unless ``--allow-non-debug`` is given
(staging demos), and it never touches existing companies.
"""

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
DEMO_CUSTOMERS = [  # (first 10 digits of the cédula, names, phone)
    ("0011234567", "María", "Gómez", "8095550101"),
    ("4022345678", "José", "Pérez Santana", "8295550102"),
    ("0013456789", "Ana Luisa", "Rodríguez", "8495550103"),
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
            for first_ten, first_name, last_name, phone in DEMO_CUSTOMERS:
                Customer.objects.create(
                    company=reg.company,
                    kind=Customer.Kind.PERSON,
                    document_type=Customer.DocumentType.CEDULA,
                    document_number=cedula(first_ten),
                    first_name=first_name,
                    last_name=last_name,
                    phone=phone,
                    home_branch=reg.branch,
                )
        self.stdout.write(f"«{DEMO_COMPANY}»: gerente@modelo.test y un usuario por rol.")

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
