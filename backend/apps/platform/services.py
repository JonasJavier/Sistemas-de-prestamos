"""Company lifecycle services (flow F19, decisions 045-046).

``register_company`` is the single entry point that turns a public signup
into a working tenant: company in trial, main branch, admin user with the
manager + administrator roles, and the seeded catalogs (system roles,
Dominican holidays, reasons). Everything happens in one transaction.
"""

import datetime as dt
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Membership, Role, User
from apps.core.models import Branch, Company, Holiday, Reason
from apps.core.tenancy import company_context
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

# Dominican holidays (doc 03 - section 4). Fixed dates arrive confirmed;
# the ones Law 139-97 may move to Monday arrive unconfirmed, and the
# religious movable ones (Viernes Santo, Corpus Christi) are added by
# each company because they change date every year.
FIXED_HOLIDAYS = [
    ((1, 1), "Año Nuevo"),
    ((1, 21), "Nuestra Señora de la Altagracia"),
    ((2, 27), "Independencia Nacional"),
    ((12, 25), "Navidad"),
]
MOVABLE_HOLIDAYS = [
    ((1, 6), "Día de los Santos Reyes"),
    ((1, 26), "Natalicio de Juan Pablo Duarte"),
    ((5, 1), "Día del Trabajo"),
    ((8, 16), "Restauración de la República"),
    ((11, 6), "Día de la Constitución"),
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
    admin_password: str,
    admin_first_name: str,
    admin_last_name: str,
    trade_name: str = "",
    rnc: str = "",
    phone: str = "",
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
        _seed_holidays(company, today.year)
        _seed_reasons(company)

    return RegistrationResult(company=company, admin=admin, branch=branch)


def _seed_holidays(company: Company, start_year: int) -> None:
    holidays = []
    for year in (start_year, start_year + 1):
        for (month, day), name in FIXED_HOLIDAYS:
            holidays.append(
                Holiday(company=company, date=dt.date(year, month, day), name=name)
            )
        for (month, day), name in MOVABLE_HOLIDAYS:
            holidays.append(
                Holiday(
                    company=company,
                    date=dt.date(year, month, day),
                    name=name,
                    is_confirmed=False,  # Law 139-97 may move it; the company confirms.
                )
            )
    Holiday.objects.bulk_create(holidays)


def _seed_reasons(company: Company) -> None:
    Reason.objects.bulk_create(
        Reason(company=company, kind=kind, text=text)
        for kind, texts in SEED_REASONS.items()
        for text in texts
    )
