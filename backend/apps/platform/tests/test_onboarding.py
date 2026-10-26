"""D2 (decision 129): the first steps are read from what the company did."""

import datetime as dt

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.conftest import add_user, open_cash
from apps.core.models import Branch
from apps.core.tenancy import company_context
from apps.lending.models import LoanProduct
from apps.payments.tests.test_payments import make_loan
from apps.platform.services import register_company

URL = "/api/v1/mi-empresa/primeros-pasos/"


def test_a_new_company_starts_with_nothing_done(db) -> None:
    reg = register_company(
        legal_name="Financiera Nueva SRL",
        admin_email="gerente@nueva.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )
    client = APIClient()
    client.force_login(reg.admin)
    data = client.get(URL).json()
    assert data["total"] == 6 and data["done"] == 0
    assert data["steps"] == {
        "company": False,
        "branch": False,
        "product": False,  # the two seeded examples do not count
        "team": False,
        "cash": False,
        "loan": False,
    }
    assert data["customers"] == 0 and data["has_logo"] is False

    # Only the management roles see the guide.
    cashier = add_user(reg, "cajero@nueva.do", "Cajero")
    other = APIClient()
    other.force_login(cashier)
    assert other.get(URL).status_code == 403


def test_each_step_turns_on_with_the_real_action(tenant) -> None:
    client = tenant.client("gerente")
    before = client.get(URL).json()
    assert before["steps"]["team"] is True  # the tenant fixture adds a user per role
    assert before["steps"]["company"] is False
    assert before["steps"]["cash"] is False and before["steps"]["loan"] is False

    company = tenant.company
    company.address = "Av. Duarte 10, Santiago"
    company.phone = "809-555-0100"
    company.save(update_fields=["address", "phone"])
    with company_context(company.id):
        Branch.objects.filter(pk=tenant.branch.pk).update(address="Av. Duarte 10")
        # Shaping a seeded product: an edit well after the registration.
        product = LoanProduct.objects.filter(company_id=company.id).first()
        LoanProduct.objects.filter(pk=product.pk).update(
            created_at=product.created_at - dt.timedelta(hours=1)
        )
    open_cash(tenant)
    make_loan(tenant, first_due_in=7)

    after = client.get(URL).json()
    assert after["steps"] == {
        "company": True,
        "branch": True,
        "product": True,
        "team": True,
        "cash": True,
        "loan": True,
    }
    assert after["done"] == 6 and after["customers"] >= 1


def test_platform_owner_without_company_gets_403(db) -> None:
    owner = User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123")
    client = APIClient()
    client.force_login(owner)
    assert client.get(URL).status_code == 403
