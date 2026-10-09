"""The nightly reconciliation, the business alarm (doc 05 - section 7).

Compares every cache with the books: account balances with their lines,
each loan's principal outstanding with its portfolio lines, and the cash
of each open drawer with what its session expects. Any difference is a
bug or a tampering, so it is reported to the managers the same night.
"""

from decimal import Decimal
from uuid import UUID

from django.db.models import Sum

from apps.ledger import services as ledger
from apps.ledger.models import JournalLine, LedgerAccount

ZERO = Decimal("0.00")


def check(company_id: UUID) -> list[str]:
    from apps.cash.models import CashSession
    from apps.cash.services import expected_cash
    from apps.lending.models import Loan

    problems = []
    for account in LedgerAccount.objects.select_related("balance"):
        cached, real = account.balance.balance, ledger.recomputed_balance(account)
        if cached != real:
            problems.append(f"Cuenta {account}: saldo guardado {cached}, libro {real}.")
    portfolio = ledger.system_account(company_id, "loan_portfolio")
    totals = (
        JournalLine.objects.filter(account=portfolio)
        .values("loan_id")
        .annotate(debit=Sum("debit"), credit=Sum("credit"))
    )
    by_loan = {row["loan_id"]: row["debit"] - row["credit"] for row in totals}
    for loan_id, number, outstanding, status in Loan.objects.values_list(
        "id", "number", "principal_outstanding", "status"
    ):
        net = by_loan.get(loan_id, ZERO)
        # Decision 094: a written-off loan left the books; what it still owes is a memo.
        if status == Loan.Status.WRITTEN_OFF:
            outstanding = ZERO
        if net != outstanding:
            problems.append(f"Préstamo {number}: capital {outstanding}, cartera en el libro {net}.")
    # Phase 6: what the payables say is owed equals «Cuentas por pagar».
    from apps.expenses.models import Payable

    owed = sum(
        (
            p.amount - p.paid
            for p in Payable.objects.filter(recognized_entry__isnull=False).exclude(
                status=Payable.Status.CANCELLED
            )
        ),
        ZERO,
    )
    payables = ledger.balance_of(ledger.system_account(company_id, "payables"))
    if owed != payables:
        problems.append(f"Cuentas por pagar: pendiente {owed}, libro {payables}.")
    # Decision 075: open shortages and overages equal their two accounts.
    from apps.cash.models import CashDifference

    for kind, key in (("shortage", "cash_shortage"), ("overage", "cash_overage_pending")):
        open_total = sum(
            (
                d.outstanding
                for d in CashDifference.objects.filter(kind=kind, status=CashDifference.Status.OPEN)
            ),
            ZERO,
        )
        booked = ledger.balance_of(ledger.system_account(company_id, key))
        if open_total != booked:
            problems.append(
                f"Diferencias de caja ({kind}): pendiente {open_total}, libro {booked}."
            )
    for session in CashSession.objects.filter(status=CashSession.Status.OPEN).select_related(
        "drawer__ledger_account"
    ):
        if ledger.balance_of(session.drawer.ledger_account) != expected_cash(session):
            problems.append(f"Caja {session.number}: el efectivo no coincide con su sesión.")
    return problems
