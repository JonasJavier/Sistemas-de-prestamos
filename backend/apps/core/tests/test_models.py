import pytest
from django.db import IntegrityError, transaction

from apps.core.models import Branch, Company
from apps.core.tenancy import company_context


@pytest.fixture
def company(db) -> Company:
    return Company.objects.create(legal_name="Financiera Uno SRL")


@pytest.fixture
def other_company(db) -> Company:
    return Company.objects.create(legal_name="Financiera Dos SRL")


def test_branch_code_unique_within_company(company: Company) -> None:
    with company_context(company.id):
        Branch.objects.create(company=company, code="SD", name="Santo Domingo")
        with pytest.raises(IntegrityError), transaction.atomic():
            Branch.objects.create(company=company, code="SD", name="Duplicada")


def test_same_branch_code_allowed_across_companies(
    company: Company, other_company: Company
) -> None:
    with company_context(company.id):
        Branch.objects.create(company=company, code="SD", name="Santo Domingo")
    with company_context(other_company.id):
        branch = Branch.objects.create(company=other_company, code="SD", name="Santo Domingo")
    assert branch.company == other_company


def test_company_starts_in_trial(company: Company) -> None:
    assert company.status == Company.Status.TRIAL
