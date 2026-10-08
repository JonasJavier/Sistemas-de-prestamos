"""F16, basic: migrated loans keep their history, move no cash and square."""

import datetime as dt
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.conftest import cash_total, open_cash
from apps.core.tenancy import company_context
from apps.ledger.reconciliation import check
from apps.lending.migration import LegacyLoan, MigrationError, migrate_loan
from apps.lending.models import Loan, LoanProduct
from apps.payments.models import Payment
from apps.payments.reversals import check_reversible
from apps.payments.services import PaymentError
from apps.payments.tests.test_payments import books_square, pay

D = Decimal
SAN = "Personal San (semanal)"


def _legacy(tenant, **overrides) -> LegacyLoan:
    start = timezone.localdate() - dt.timedelta(days=30)
    values = {
        "customer": tenant.customer,
        "product": LoanProduct.objects.get(name=SAN),
        "amount": D("1000"),
        "rate": D("0.10"),
        "frequency": "weekly",
        "installments": 4,
        "disbursed_on": start,
        "principal_balance": D("500.00"),
        "payments": (
            (start + dt.timedelta(days=7), D("350")),
            (start + dt.timedelta(days=14), D("350")),
        ),
        "legacy_number": "VIEJO-0042",
    }
    return LegacyLoan(**{**values, **overrides})


def test_a_migrated_loan_keeps_its_history_and_moves_no_cash(tenant) -> None:
    before = cash_total(tenant)
    with company_context(tenant.company.id):
        loan = migrate_loan(data=_legacy(tenant), user=tenant.users["gerente"])
        assert loan.is_migrated and loan.legacy_number == "VIEJO-0042"
        assert loan.principal_outstanding == D("500.00")
        history = list(Payment.objects.filter(loan=loan).order_by("value_date"))
        assert [p.kind for p in history] == ["migrated", "migrated"]
        assert all(p.journal_entry_id is None for p in history)
        assert check(tenant.company.id) == []
        # History is not reversed from here (doc 03 - 11).
        with pytest.raises(PaymentError, match="migrados"):
            check_reversible(history[-1])
    assert cash_total(tenant) == before  # no cash moved
    books_square(tenant)
    # From now on it is collected like any other loan, in the open drawer.
    open_cash(tenant)
    payment = pay(tenant, loan, "100")
    assert payment.journal_entry_id is not None
    assert cash_total(tenant) == before + D("100")
    books_square(tenant)


def test_the_balance_must_square_with_the_previous_system(tenant) -> None:
    with company_context(tenant.company.id):
        with pytest.raises(MigrationError, match="No cuadra"):
            migrate_loan(
                data=_legacy(tenant, principal_balance=D("499.99")), user=tenant.users["gerente"]
            )
        assert not Loan.objects.exists()
        with pytest.raises(MigrationError, match="gerente o el administrador"):
            migrate_loan(data=_legacy(tenant), user=tenant.users["cajero"])
        with pytest.raises(MigrationError, match="supera"):
            migrate_loan(
                data=_legacy(tenant, payments=((timezone.localdate(), D("5000")),)),
                user=tenant.users["gerente"],
            )


def test_the_csv_command_rehearses_then_applies(tenant, tmp_path) -> None:
    start = timezone.localdate() - dt.timedelta(days=30)
    path = tmp_path / "prestamos.csv"
    path.write_text(
        "documento,producto,monto,tasa,frecuencia,cuotas,fecha_desembolso,primera_cuota,"
        "numero_anterior,cobrador,saldo_capital,pagos\n"
        f"001-1234567-4,{SAN},1000,0.10,weekly,4,{start},,A-1,cobrador@uno.do,750.00,"
        f"{start + dt.timedelta(days=7)}:350\n"
        f"999-9999999-9,{SAN},1000,0.10,weekly,4,{start},,A-2,,1000.00,\n",
        encoding="utf-8",
    )
    call_command("migrar_prestamos", str(path), usuario="gerente@uno.do")
    with company_context(tenant.company.id):
        assert not Loan.objects.exists()  # a rehearsal saves nothing
    call_command("migrar_prestamos", str(path), usuario="gerente@uno.do", aplicar=True)
    with company_context(tenant.company.id):
        assert not Loan.objects.exists()  # one bad row: nothing is saved
    path.write_text(
        path.read_text(encoding="utf-8").splitlines()[0]
        + "\n"
        + path.read_text(encoding="utf-8").splitlines()[1]
        + "\n",
        encoding="utf-8",
    )
    call_command("migrar_prestamos", str(path), usuario="gerente@uno.do", aplicar=True)
    with company_context(tenant.company.id):
        loan = Loan.objects.get(legacy_number="A-1")
        assert loan.collector == tenant.users["cobrador"]
        assert loan.principal_outstanding == D("750.00")
    books_square(tenant)
