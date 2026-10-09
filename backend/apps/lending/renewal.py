"""F11 · Renovación (decision 092): a new loan that pays the old one off.

``start`` opens an application prefilled from the loan; it goes through the
normal evaluation and approval. Disbursing it pays the old loan off from
the new amount (``disbursement._pay_off_renewed``): cash out = new amount −
the old loan's payoff − the new loan's discounted charges (E15).
"""

from decimal import Decimal

from django.utils import timezone

from apps.accounts.models import User
from apps.lending import applications as flow
from apps.lending.models import Application, Loan


def payoff_today(loan: Loan) -> Decimal:
    """The old loan's «saldo para saldar» today, late fees included."""
    from apps.payments import portfolio
    from apps.payments.services import plan_payoff

    today = timezone.localdate()
    lines = portfolio.position(loan, today)
    _, amount = plan_payoff(loan, lines, portfolio.current_terms(loan), today, Decimal("0.00"))
    return amount


def start(loan: Loan, *, user: User) -> Application:
    from apps.payments import portfolio

    terms = portfolio.current_terms(loan)
    product = loan.product
    if not product.is_active:
        raise flow.ApplicationError(
            "El producto del préstamo ya no está activo: crea la solicitud con otro.",
            code="product",
        )
    return flow.create_application(
        user=user,
        customer=loan.customer,
        product=product,
        amount=loan.principal,
        frequency=terms.frequency,
        installments=terms.installments,
        rate=terms.rate,
        purpose=f"Renovación del préstamo {loan.number}",
        renews=loan,
    )
