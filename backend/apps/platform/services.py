"""Company lifecycle services (flow F19, decisions 045-046).

``register_company`` is the single entry point that turns a public signup
into a working tenant: company in trial, main branch, admin user with the
manager + administrator roles, and the seeded catalogs (system roles with
their approval limits, Dominican holidays, reasons, example products and
the chart of accounts with a «Caja general»). One transaction.
"""

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.authz import DEFAULT_APPROVAL_LIMITS
from apps.accounts.models import ApprovalLimit, Membership, Role, User
from apps.collections.defaults import seed_escalation_rules
from apps.core.holidays import seed_year
from apps.core.models import Branch, Company, Reason
from apps.core.tenancy import company_context
from apps.expenses.defaults import seed_expense_setup
from apps.ledger.services import seed_chart
from apps.lending.models import LateFeePolicy, LoanProduct, ProductCharge
from apps.platform.models import Plan, Subscription

TRIAL_DAYS = 30  # F19 default; configurable per plan later.

SYSTEM_ROLES = [
    "Gerente",
    "Administrador",
    "Supervisor",
    "Oficial de crédito",
    "Cajero",
    "Cobrador",
    "Contabilidad",
    "Auditoría",
]

SEED_REASONS = {
    Reason.Kind.REJECTION: [
        "Capacidad de pago insuficiente",
        "Historial crediticio negativo",
        "Documentación incompleta",
    ],
    Reason.Kind.REVERSAL: ["Monto digitado incorrecto", "Pago duplicado"],
    Reason.Kind.WRITE_OFF: ["Incobrable tras agotar la gestión"],
    Reason.Kind.VOID: ["Desembolso registrado por error"],
    Reason.Kind.BLOCK: ["Mora grave", "Fraude comprobado"],
    Reason.Kind.DATE_CHANGE: ["Acuerdo con el cliente"],
    Reason.Kind.CASH_DIFFERENCE: ["Error de conteo"],
}


@dataclass(frozen=True)
class RegistrationResult:
    company: Company
    admin: User
    branch: Branch


@transaction.atomic
def register_company(
    *,
    legal_name: str,
    admin_email: str,
    admin_password: str | None,
    admin_first_name: str,
    admin_last_name: str,
    trade_name: str = "",
    rnc: str = "",
    phone: str = "",
    terms_version: str = "",
) -> RegistrationResult:
    today = timezone.localdate()
    trial_plan = Plan.objects.get(is_trial=True, is_active=True)

    company = Company.objects.create(
        legal_name=legal_name,
        trade_name=trade_name,
        rnc=rnc,
        phone=phone,
        status=Company.Status.TRIAL,
        trial_ends_on=today + dt.timedelta(days=TRIAL_DAYS),
        terms_version=terms_version,
        terms_accepted_at=timezone.now() if terms_version else None,
    )
    Subscription.objects.create(
        company=company,
        plan=trial_plan,
        status=Subscription.Status.TRIAL,
        started_on=today,
    )
    admin = User.objects.create_user(
        admin_email,
        admin_password,
        company=company,
        first_name=admin_first_name,
        last_name=admin_last_name,
        phone=phone,
    )

    # Everything below lives in RLS-protected tables.
    with company_context(company.id):
        branch = Branch.objects.create(company=company, code="01", name="Principal")
        roles = {
            name: Role.objects.create(company=company, name=name, is_system=True)
            for name in SYSTEM_ROLES
        }
        for role_name in ("Gerente", "Administrador"):
            Membership.objects.create(
                company=company, user=admin, branch=branch, role=roles[role_name]
            )
        _seed_approval_limits(company, roles)
        _seed_holidays(company, today.year)
        _seed_reasons(company)
        _seed_products(company)
        seed_chart(company, branch)
        seed_escalation_rules(company)
        seed_expense_setup(company.id)

    return RegistrationResult(company=company, admin=admin, branch=branch)


def _seed_approval_limits(company: Company, roles: dict[str, Role]) -> None:
    ApprovalLimit.objects.bulk_create(
        ApprovalLimit(company=company, role=roles[role_name], operation=op, max_amount=amount)
        for role_name, limits in DEFAULT_APPROVAL_LIMITS.items()
        for op, amount in limits.items()
    )


def _seed_holidays(company: Company, start_year: int) -> None:
    for year in (start_year, start_year + 1):
        seed_year(company.id, year)


def _seed_products(company: Company) -> None:
    """Two editable example products (F19), with doc 03 default values."""
    san = LoanProduct.objects.create(
        company=company,
        name="Personal San (semanal)",
        type=LoanProduct.Type.PERSONAL,
        method="flat",
        allowed_frequencies=["weekly", "daily", "interdaily"],  # the first is proposed
        rate_unit="per_period",
        min_amount=Decimal("1000"),
        max_amount=Decimal("200000"),
        min_rate=Decimal("0.01"),
        max_rate=Decimal("0.20"),
        default_rate=Decimal("0.10"),
        min_term=4,
        max_term=52,
    )
    fija = LoanProduct.objects.create(
        company=company,
        name="Cuota Fija (mensual)",
        type=LoanProduct.Type.PERSONAL,
        method="fixed_payment",
        allowed_frequencies=["monthly", "biweekly"],
        rate_unit="monthly",
        min_amount=Decimal("10000"),
        max_amount=Decimal("1000000"),
        min_rate=Decimal("0.01"),
        max_rate=Decimal("0.10"),
        default_rate=Decimal("0.05"),
        min_term=3,
        max_term=36,
    )
    for product in (san, fija):
        LateFeePolicy.objects.create(company=company, product=product)
    ProductCharge.objects.create(
        company=company,
        product=fija,
        name="Gastos de cierre",
        basis=ProductCharge.Basis.PERCENT,
        value=Decimal("0.02"),
        mode=ProductCharge.Mode.DISCOUNTED,
    )


def _seed_reasons(company: Company) -> None:
    Reason.objects.bulk_create(
        Reason(company=company, kind=kind, text=text)
        for kind, texts in SEED_REASONS.items()
        for text in texts
    )


DEMO_PLAN = "Demostración"


def use_demo_plan(company: Company) -> None:
    """Demo and test companies (one user per role) run without the trial's
    caps; the plan is never offered to customers (decision 104)."""
    plan, _ = Plan.objects.get_or_create(
        name=DEMO_PLAN, defaults={"monthly_price": 0, "is_trial": False, "is_active": False}
    )
    Subscription.objects.filter(company=company).update(plan=plan)
