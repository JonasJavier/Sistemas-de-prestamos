"""Phase 8 · F11: renewal pays the old loan off from the new disbursement
(E15) and voiding it reopens the old one (decision 092)."""

import uuid
from decimal import Decimal

from django.utils import timezone

from apps.conftest import cash_total, open_cash
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.ledger import services as ledger
from apps.lending.models import Loan, ProductCharge
from apps.lending.tests.test_disbursement import SAN, _books_balance, _set_charge
from apps.payments import reversals
from apps.payments.models import Payment
from apps.payments.services import PaymentError
from apps.payments.tests.test_payments import make_loan, pay
from apps.reports import indicators

D = Decimal


def renew(tenant, loan, amount: str) -> str:
    """The officer starts the renewal, sets the amount, verifies and sends it;
    the supervisor approves. Returns the application id."""
    officer = tenant.client("oficial")
    created = officer.post(f"/api/v1/prestamos/{loan.number}/renovar/")
    assert created.status_code == 201, created.content
    app = created.json()
    assert app["renews_number"] == loan.number
    patched = officer.patch(f"/api/v1/solicitudes/{app['id']}/", {"amount": amount}, format="json")
    assert patched.status_code == 200, patched.content
    for req in officer.get(f"/api/v1/solicitud-requisitos/?application={app['id']}").json():
        officer.post(f"/api/v1/solicitud-requisitos/{req['id']}/verificar/")
    return app["id"]


def send_and_approve(tenant, app_id) -> None:
    officer = tenant.client("oficial")
    assert officer.post(f"/api/v1/solicitudes/{app_id}/enviar/").status_code == 200
    approved = tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    assert approved.status_code == 200, approved.content


def disburse(tenant, app_id):
    open_cash(tenant)
    return tenant.client("cajero").post(
        f"/api/v1/solicitudes/{app_id}/desembolsar/",
        {"method": "cash", "idempotency_key": uuid.uuid4().hex},
        format="json",
    )


def bridge_balance(tenant) -> Decimal:
    with company_context(tenant.company.id):
        return ledger.balance_of(ledger.system_account(tenant.company.id, "renewal_clearing"))


def test_e15_renewal_hands_over_the_net_and_closes_the_old_loan(tenant) -> None:
    old = make_loan(tenant, first_due_in=-3)
    pay(tenant, old, "350.00")  # E12: installment 1 paid, period 2 running → payoff 850.00
    _set_charge(tenant, SAN, ProductCharge.Mode.DISCOUNTED)  # 2 % closing costs
    app_id = renew(tenant, old, "1500")
    evaluation = tenant.client("oficial").get(f"/api/v1/solicitudes/{app_id}/evaluacion/").json()
    assert evaluation["renewal"]["payoff"] == "850.00"
    assert evaluation["renewal"]["net"] == "620.00"
    # Only one renewal of a loan at a time.
    again = tenant.client("oficial").post(f"/api/v1/prestamos/{old.number}/renovar/")
    assert again.status_code == 400 and again.json()["code"] == "renewal"
    send_and_approve(tenant, app_id)
    preview = tenant.client("cajero").get(f"/api/v1/solicitudes/{app_id}/desembolso/").json()
    assert preview["renewal"] == {"loan": old.number, "payoff": "850.00", "net": "620.00"}

    before = cash_total(tenant)
    response = disburse(tenant, app_id)
    assert response.status_code == 201, response.content
    with company_context(tenant.company.id):
        new = Loan.objects.get(number=response.json()["loan"])
        old.refresh_from_db()
        disbursement = new.disbursement
        # E15: 1,500.00 − 850.00 − 30.00 = 620.00 to hand over.
        assert (disbursement.gross, disbursement.renewal_payoff, disbursement.net) == (
            D("1500.00"),
            D("850.00"),
            D("620.00"),
        )
        assert new.renewed_from == old
        assert (old.status, old.closed_on) == (Loan.Status.RENEWED, timezone.localdate())
        assert old.principal_outstanding == D("0.00")
        payoff = Payment.objects.get(loan=old, method=Payment.Method.RENEWAL)
        assert (payoff.kind, payoff.amount, payoff.interest_waived) == (
            Payment.Kind.PAYOFF,
            D("850.00"),
            D("200.00"),
        )
        assert payoff.financial_account is None  # no cash: the bridge account
        # Only the regular payment is money in; the renewal payoff is not.
        assert indicators.collected(timezone.localdate()) == D("350.00")
        with_manual = reversals.request_reversal
        try:
            with_manual(
                payment=payoff,
                user=tenant.users["cajero"],
                reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
                note="error",
            )
            raise AssertionError("a renewal payoff must not be reversed by hand")
        except PaymentError as exc:
            assert exc.code == "renewal"
    assert cash_total(tenant) == before - D("620.00")
    assert bridge_balance(tenant) == D("0.00")
    _books_balance(tenant)
    loan_api = tenant.client("gerente").get(f"/api/v1/prestamos/{old.number}/").json()
    assert loan_api["renewed_by_number"] == new.number


def test_voiding_the_renewal_reopens_the_old_loan(tenant) -> None:
    old = make_loan(tenant, first_due_in=-3)
    pay(tenant, old, "350.00")
    _set_charge(tenant, SAN, ProductCharge.Mode.DISCOUNTED)
    app_id = renew(tenant, old, "1500")
    send_and_approve(tenant, app_id)
    before = cash_total(tenant)
    number = disburse(tenant, app_id).json()["loan"]
    with company_context(tenant.company.id):
        reason = Reason.objects.filter(kind=Reason.Kind.VOID).first()
    voided = tenant.client("gerente").post(
        f"/api/v1/prestamos/{number}/anular/",
        {"reason": reason.id, "note": "Renovación hecha por error"},
        format="json",
    )
    assert voided.status_code == 200, voided.content
    with company_context(tenant.company.id):
        old.refresh_from_db()
        assert old.status == Loan.Status.ACTIVE and old.closed_on is None
        assert old.principal_outstanding == D("750.00")
        payoff = Payment.objects.get(loan=old, method=Payment.Method.RENEWAL)
        assert payoff.status == Payment.Status.REVERSED
    assert cash_total(tenant) == before
    assert bridge_balance(tenant) == D("0.00")
    _books_balance(tenant)


def test_a_renewal_that_does_not_cover_the_old_loan_is_stopped(tenant) -> None:
    old = make_loan(tenant, first_due_in=-3)  # nothing paid: payoff 1,100.00
    _set_charge(tenant, SAN, ProductCharge.Mode.DISCOUNTED)
    app_id = renew(tenant, old, "1000")  # 980.00 net of charges
    evaluation = tenant.client("oficial").get(f"/api/v1/solicitudes/{app_id}/evaluacion/").json()
    assert any(alert["code"] == "renewal_short" for alert in evaluation["alerts"])
    sent = tenant.client("oficial").post(f"/api/v1/solicitudes/{app_id}/enviar/")
    assert sent.status_code == 400
    # Another customer's loan is never renewed from here.
    assert (
        tenant.client("cobrador").post(f"/api/v1/prestamos/{old.number}/renovar/").status_code
        == 403
    )
