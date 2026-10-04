import pytest
from django.db import IntegrityError

from apps.core.models import Branch, Company


@pytest.fixture
def company(db) -> Company:
    return Company.objects.create(legal_name="Financiera Uno SRL")


@pytest.fixture
def other_company(db) -> Company:
    return Company.objects.create(legal_name="Financiera Dos SRL")


def test_branch_code_unique_within_company(company: Company) -> None:
    Branch.objects.create(company=company, code="SD", name="Santo Domingo")
    with pytest.raises(IntegrityError):
        Branch.objects.create(company=company, code="SD", name="Duplicada")


def test_same_branch_code_allowed_across_companies(
    company: Company, other_company: Company
) -> None:
    Branch.objects.create(company=company, code="SD", name="Santo Domingo")
    branch = Branch.objects.create(company=other_company, code="SD", name="Santo Domingo")
    assert branch.company == other_company


def test_company_starts_in_trial(company: Company) -> None:
    assert company.status == Company.Status.TRIAL
