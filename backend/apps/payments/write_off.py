"""F13 · Castigo y recuperación (decision 094).

The system suggests writing a loan off past the company's days late (180
by default); the manager does it with a reason from the catalog and his
second factor. Its principal leaves the portfolio against «Gasto por
castigo de cartera»; the loan keeps its installments as a memo of what is
owed, collection goes on, and whatever is collected afterwards is
recovery income, reported apart.
"""

import datetime as dt

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Company, Reason
from apps.customers.access import scope_loans
from apps.ledger import services as ledger
from apps.lending.models import Loan
from apps.notifications.models import Notification
from apps.notifications.services import managers, notify
from apps.payments import portfolio
from apps.payments.services import PaymentError

WRITE_OFF_ROLES = (authz.GERENTE,)


def suggested(user: User) -> QuerySet[Loan]:
    """Active loans past the company's write-off days, oldest arrears first."""
    days = Company.objects.only("write_off_days").get(pk=user.company_id).write_off_days
    loans = Loan.objects.filter(status=Loan.Status.ACTIVE, days_past_due__gte=days)
    return scope_loans(loans, user).select_related("customer").order_by("-days_past_due")


@transaction.atomic
def write_off(*, loan: Loan, user: User, reason: Reason, note: str) -> Loan:
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if not authz.has_any_role(user, *WRITE_OFF_ROLES):
        raise PaymentError("Solo el gerente castiga un préstamo.", "forbidden")
    if not authz.in_scope(user, loan.branch_id):
        raise PaymentError("El préstamo es de otra sucursal.", "out_of_scope")
    if loan.status != Loan.Status.ACTIVE:
        raise PaymentError("Solo se castiga un préstamo activo.", "state")
    if reason.kind != Reason.Kind.WRITE_OFF or not reason.is_active:
        raise PaymentError("Elige un motivo de castigo del catálogo.", "reason")
    if not note.strip():
        raise PaymentError("Escribe la nota del castigo.", "note")
    today: dt.date = timezone.localdate()
    portfolio.refresh(loan, today)
    principal = loan.principal_outstanding
    if principal <= 0:
        raise PaymentError("Sin capital pendiente no hay nada que castigar.", "nothing")
    dims = {"loan_id": loan.id, "customer_id": loan.customer_id}
    company_id = loan.company_id
    entry = ledger.post_entry(
        company_id=company_id,
        branch=loan.branch,
        on=today,
        description=f"Castigo del préstamo {loan.number}: {reason.text}",
        source_type="lending.write_off",
        source_id=loan.id,
        lines=[
            ledger.debit(ledger.system_account(company_id, "write_off_expense"), principal, **dims),
            ledger.credit(ledger.system_account(company_id, "loan_portfolio"), principal, **dims),
        ],
        created_by=user,
    )
    loan.status = Loan.Status.WRITTEN_OFF
    loan.written_off_on = today
    loan.save(update_fields=["status", "written_off_on", "updated_at"])
    record_event(
        company_id=company_id,
        type="loan.written_off",
        target=loan,
        actor=user,
        summary=f"Castigado: RD$ {principal:,.2f} de capital. {reason.text}: {note.strip()}"[:300],
        data={"entry": entry.number},
    )
    notify(
        company_id=company_id,
        users=managers(exclude=user),
        kind=Notification.Kind.ESCALATION,
        text=f"{user.get_full_name() or user.email} castigó el préstamo {loan.number} "
        f"(RD$ {principal:,.2f} de capital).",
        link=f"/prestamos/{loan.number}",
    )
    return loan
