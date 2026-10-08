"""Moving a loan's dates (doc 03 - section 4): a new calendar version.

Only installments without any payment move; amounts and interest stay
the same; the new dates follow the frequency from the chosen first one,
skip the non-working days of the loan and never fall before the
disbursement nor out of order with the installments that stay.
"""

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Holiday, Reason
from apps.lending.models import Loan, LoanTerms
from apps.payments import portfolio
from apps.payments.services import PaymentError, _untouched, new_version
from engine.rates import Frequency
from engine.schedule import Installment as Row
from engine.schedule import due_dates

ZERO = Decimal("0.00")
CHANGE_ROLES = (authz.GERENTE, authz.SUPERVISOR)


def non_working(terms: LoanTerms):
    holidays: set[dt.date] = set()
    if not terms.collect_holidays:
        holidays = set(Holiday.objects.filter(is_confirmed=True).values_list("date", flat=True))

    def is_non_working(day: dt.date) -> bool:
        if day.weekday() == 5 and not terms.collect_saturdays:
            return True
        if day.weekday() == 6 and not terms.collect_sundays:
            return True
        return day in holidays

    return is_non_working


@transaction.atomic
def change_dates(
    *, loan: Loan, user: User, first_due: dt.date, reason: Reason, note: str
) -> LoanTerms:
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if not authz.has_any_role(user, *CHANGE_ROLES):
        raise PaymentError("Solo el supervisor o el gerente cambian fechas.", "forbidden")
    if not authz.in_scope(user, loan.branch_id):
        raise PaymentError("El préstamo es de otra sucursal.", "out_of_scope")
    if loan.status != Loan.Status.ACTIVE:
        raise PaymentError("Solo se cambian las fechas de un préstamo activo.", "state")
    if reason.kind != Reason.Kind.DATE_CHANGE:
        raise PaymentError("Elige un motivo de cambio de fecha del catálogo.", "reason")
    if not note.strip():
        raise PaymentError("Escribe la nota del cambio.", "note")
    today = timezone.localdate()
    if first_due < today:
        raise PaymentError("La nueva fecha no puede estar en el pasado.", "first_due")
    lines = portfolio.position(loan, today)
    moving = [line.installment for line in lines if _untouched(line.installment) and line.total > 0]
    staying = [line.installment for line in lines if line.installment not in moving]
    if not moving:
        raise PaymentError("No quedan cuotas sin pagos que mover.", "nothing")
    floor = max([loan.disbursed_on, *[inst.due_date for inst in staying]])
    if first_due <= floor:
        raise PaymentError(
            f"La primera fecha nueva debe ser posterior al {floor:%d/%m/%Y}.", "first_due"
        )
    terms = portfolio.current_terms(loan)
    dates = due_dates(
        installments=len(moving),
        frequency=Frequency(terms.frequency),
        start_after=floor,
        first_due=first_due,
        is_non_working=non_working(terms),
    )
    rows = [
        Row(
            number=inst.number,
            due_date=due,
            original_due_date=original,
            principal=inst.principal_due,
            interest=inst.interest_due,
        )
        for inst, (due, original) in zip(moving, dates, strict=True)
    ]
    version = new_version(
        loan=loan,
        base=terms,
        reason=f"Cambio de fecha: {reason.text}",
        user=user,
        on=today,
        rows=rows,
        first_number=moving[0].number,
        replaced=moving,
        principal=sum((row.principal for row in rows), ZERO),
    )
    portfolio.refresh(loan, today)
    record_event(
        company_id=loan.company_id,
        type="loan.dates_changed",
        target=loan,
        actor=user,
        summary=f"Fechas movidas: la próxima cuota vence el {dates[0][0]:%d/%m/%Y}. "
        f"{reason.text}: {note.strip()}",
    )
    return version
