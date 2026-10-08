"""The demo seed (doc 10 - 3): repeatable, complete and only for development."""

import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings

from apps.accounts.models import User
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.customers.models import Customer
from apps.customers.validators import validate_cedula
from apps.documents.models import GeneratedDocument
from apps.lending.models import Loan
from apps.platform.management.commands.seed_demo import DEMO_COMPANY, OTHER_COMPANY


@override_settings(DEBUG=True)
def test_seed_creates_two_isolated_tenants_and_is_idempotent(
    db, django_capture_on_commit_callbacks
) -> None:
    # What runs at commit (the cash-close PDF) runs here too, as in real life.
    with django_capture_on_commit_callbacks(execute=True):
        call_command("seed_demo")
    call_command("seed_demo")  # a second run changes nothing
    demo = Company.objects.get(legal_name=DEMO_COMPANY)
    other = Company.objects.get(legal_name=OTHER_COMPANY)
    assert User.objects.filter(company=demo).count() == 6
    assert User.objects.get(email="dueno@cobradia.test").is_platform_admin
    with company_context(demo.id):
        customers = list(Customer.objects.all())
        assert len(customers) == 3
        for customer in customers:
            validate_cedula(customer.document_number)
    with company_context(other.id):
        assert Customer.objects.count() == 1
    # Phase 4: a portfolio to collect, one of them in arrears, with its collector.
    with company_context(demo.id):
        loans = list(Loan.objects.order_by("number"))
        assert len(loans) == 3
        assert any(loan.days_past_due > 0 for loan in loans)
        assert sum(1 for loan in loans if loan.collector_id) == 2
        assert GeneratedDocument.objects.filter(kind="cash_close").count() == 1


def test_seed_refuses_without_debug(db) -> None:
    with pytest.raises(CommandError):
        call_command("seed_demo")
