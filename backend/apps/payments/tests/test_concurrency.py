"""Doc 10 · §2 (decision 106): payments that arrive at the same instant —
two cashiers on one loan, or a double click — on real, separate database
connections and transactions."""

import threading
import uuid
from decimal import Decimal

import pytest
from django.db import connections

from apps.conftest import open_cash
from apps.core.tenancy import company_context
from apps.lending.models import Loan
from apps.payments.models import Payment
from apps.payments.services import PaymentError, post_payment
from apps.payments.tests.test_payments import books_square, make_loan

# serialized_rollback: the flush between tests would wipe the data seeded by
# migrations (the trial plan, holidays, schedules) for whoever runs next.
pytestmark = pytest.mark.django_db(transaction=True, serialized_rollback=True)


def _at_once(tenant, loan, keys_and_amounts):
    """Every attempt starts together, each in its own thread and connection."""
    barrier = threading.Barrier(len(keys_and_amounts))
    results = [None] * len(keys_and_amounts)
    user = tenant.users["cajero"]

    def attempt(index, key, amount):
        try:
            barrier.wait()
            with company_context(tenant.company.id):
                payment = post_payment(
                    loan=Loan(pk=loan.pk),
                    user=user,
                    amount=Decimal(amount),
                    method="cash",
                    idempotency_key=key,
                )
            results[index] = ("ok", payment.pk)
        except PaymentError as exc:
            results[index] = ("refused", exc.code)
        finally:
            connections.close_all()

    threads = [
        threading.Thread(target=attempt, args=(index, key, amount))
        for index, (key, amount) in enumerate(keys_and_amounts)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    return results


def test_cashiers_paying_one_loan_at_once_never_overpay(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)  # 4 × 350.00 = 1,400.00
    open_cash(tenant)
    results = _at_once(tenant, loan, [(uuid.uuid4().hex, "350") for _ in range(8)])

    accepted = [r for r in results if r and r[0] == "ok"]
    assert len(accepted) == 4  # exactly what was owed; the rest refused
    assert all(r is not None for r in results)
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        assert loan.status == Loan.Status.PAID_OFF
        assert loan.principal_outstanding == 0
        paid = sum(p.amount for p in Payment.objects.filter(loan=loan))
    assert paid == Decimal("1400.00")
    books_square(tenant)


def test_a_double_click_records_one_payment(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    open_cash(tenant)
    key = uuid.uuid4().hex
    results = _at_once(tenant, loan, [(key, "350") for _ in range(6)])

    assert {r[0] for r in results} == {"ok"}
    assert len({r[1] for r in results}) == 1  # the same payment, six times
    with company_context(tenant.company.id):
        assert Payment.objects.filter(loan=loan).count() == 1
    books_square(tenant)
