"""A taxed charge carries 18 % ITBIS inside its amount (decision 075)."""

from decimal import Decimal

from apps.core.tenancy import company_context
from apps.ledger import services as ledger
from apps.lending.models import LoanCharge, ProductCharge
from apps.payments.tests.test_payments import books_square, make_loan

D = Decimal
FIJA = "Cuota Fija (mensual)"


def test_a_taxed_closing_cost_books_its_itbis_apart(tenant) -> None:
    with company_context(tenant.company.id):
        ProductCharge.objects.filter(product__name=FIJA).update(taxed=True)
    loan = make_loan(
        tenant, first_due_in=30, product=FIJA, amount="10000", installments=3, rate="0.05"
    )
    with company_context(tenant.company.id):
        charge = LoanCharge.objects.get(loan=loan)
        assert (charge.amount, charge.taxed) == (D("200.00"), True)  # E7: 2 % of 10,000
        itbis = ledger.balance_of(ledger.system_account(tenant.company.id, "itbis_payable"))
        income = ledger.balance_of(ledger.system_account(tenant.company.id, "charge_income"))
        assert (income, itbis) == (D("169.49"), D("30.51"))  # 200 / 1.18 and the rest
    books_square(tenant)
