"""F10: the «carta de saldo» — the very computation the payoff charges."""

import datetime as dt
import secrets

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Sequence
from apps.core.tenancy import on_commit_in_tenant
from apps.customers.access import can_serve
from apps.lending.models import Loan
from apps.payments import portfolio
from apps.payments.models import PayoffQuote
from apps.payments.services import PaymentError, payoff_quote

LETTER_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL, authz.CAJERO)
MAX_DAYS_AHEAD = 30


def compute(loan: Loan, as_of: dt.date):
    """The quote on ``as_of`` and the last day it stays the same."""
    lines = portfolio.position(loan, as_of)
    terms = portfolio.current_terms(loan)
    quote = payoff_quote(loan, lines, terms, as_of)
    overdue = any(line.installment.due_date < as_of and line.total > 0 for line in lines)
    upcoming = [
        line.installment.due_date
        for line in lines
        if line.installment.due_date >= as_of and line.total > 0
    ]
    # Late fees grow daily and «by days» interest too: then it holds one day.
    if overdue or not terms.payoff_full_current_period or not upcoming:
        valid_until = as_of
    else:
        valid_until = upcoming[0]
    return quote, valid_until


@transaction.atomic
def issue_quote(*, loan: Loan, user: User, as_of: dt.date | None = None) -> PayoffQuote:
    if not authz.has_any_role(user, *LETTER_ROLES):
        raise PaymentError("Tu rol no emite cartas de saldo.", "forbidden")
    if not can_serve(user, branch_id=loan.branch_id, customer_id=loan.customer_id):
        raise PaymentError("El préstamo es de otra sucursal.", "out_of_scope")
    if loan.status != Loan.Status.ACTIVE:
        raise PaymentError("Solo un préstamo activo tiene saldo para saldar.", "state")
    today = timezone.localdate()
    as_of = as_of or today
    if not today <= as_of <= today + dt.timedelta(days=MAX_DAYS_AHEAD):
        raise PaymentError(
            f"La fecha de cálculo va de hoy a {MAX_DAYS_AHEAD} días adelante.", "as_of"
        )
    quote, valid_until = compute(loan, as_of)
    letter = PayoffQuote.objects.create(
        company_id=loan.company_id,
        number=Sequence.allocate(loan.branch, Sequence.DocType.PAYOFF_QUOTE),
        loan=loan,
        as_of=as_of,
        valid_until=valid_until,
        breakdown={
            "principal": str(quote.principal),
            "overdue_interest": str(quote.overdue_interest),
            "current_interest": str(quote.current_interest),
            "future_interest": str(quote.future_interest),
            "late_fees": str(quote.late_fees),
            "charges": str(quote.charges),
            "interest_waived": str(quote.interest_waived),
        },
        total=quote.total,
        verification_token=secrets.token_urlsafe(24),
        issued_by=user,
    )
    record_event(
        company_id=loan.company_id,
        type="loan.payoff_quote",
        target=loan,
        actor=user,
        summary=f"Carta de saldo {letter.number}: RD$ {quote.total:,.2f} al {as_of:%d/%m/%Y}",
    )
    from apps.documents.services import issue_payoff_letter

    on_commit_in_tenant(loan.company_id, lambda: issue_payoff_letter(letter, issued_by=user))
    return letter
