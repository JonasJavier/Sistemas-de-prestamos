"""D5 (decision 134): the owner's business numbers."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import Company
from apps.platform import cancellation, metrics
from apps.platform.models import Plan, Subscription, SubscriptionPayment
from apps.platform.services import register_company

D = Decimal


def _company(name: str, email: str, plan: Plan, *, paid_until: dt.date) -> Company:
    reg = register_company(
        legal_name=name,
        admin_email=email,
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )
    company = reg.company
    company.status = Company.Status.ACTIVE
    company.save(update_fields=["status"])
    Subscription.objects.filter(company=company).update(
        plan=plan, status=Subscription.Status.ACTIVE, paid_until=paid_until
    )
    return company


def test_mrr_collected_due_and_churn(db) -> None:
    today = timezone.localdate()
    owner = User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123")
    esencial = Plan.objects.create(name="Esencial", monthly_price=D("990"), tier="esencial")
    pro = Plan.objects.create(name="Profesional", monthly_price=D("2290"), tier="profesional")

    a = _company("Alfa SRL", "a@alfa.do", esencial, paid_until=today + dt.timedelta(days=20))
    b = _company("Beta SRL", "b@beta.do", pro, paid_until=today + dt.timedelta(days=200))
    c = _company("Gamma SRL", "c@gamma.do", pro, paid_until=today + dt.timedelta(days=5))
    # One whose period already lapsed does not count, nor a cancelled one.
    _company("Delta SRL", "d@delta.do", pro, paid_until=today - dt.timedelta(days=1))
    gone = _company("Omega SRL", "o@omega.do", esencial, paid_until=today + dt.timedelta(days=9))
    cancellation.cancel_company(company=gone, by=gone.users.first(), reason="Me voy")

    for company, amount, days_ago in ((a, "990", 2), (b, "22900", 3), (c, "2290", 40)):
        payment = SubscriptionPayment.objects.create(
            subscription=company.subscription,
            period_start=today,
            period_end=today,
            amount=D(amount),
            method="transfer",
            recorded_by=owner,
        )
        SubscriptionPayment.objects.filter(pk=payment.pk).update(
            created_at=timezone.now() - dt.timedelta(days=days_ago)
        )

    data = metrics.business(today)
    assert data["mrr"] == "5570.00"  # 990 + 2290 + 2290
    assert data["paying"] == 3
    assert data["arpu"] == "1856.67"
    assert [(row["plan"], row["companies"], row["mrr"]) for row in data["by_plan"]] == [
        ("Profesional", 2, "4580.00"),
        ("Esencial", 1, "990.00"),
    ]
    if today.day > 3:
        assert data["collected_this_month"] == "23890.00"
    assert data["due"] == {"days": 30, "companies": 2, "amount": "3280.00"}  # Alfa and Gamma
    assert data["churn"] == {"days": 30, "companies": 1}

    board = metrics.dashboard(today)
    assert board["business"]["mrr"] == "5570.00"
    assert "mrr" in board["definitions"] and "churn" in board["definitions"]
