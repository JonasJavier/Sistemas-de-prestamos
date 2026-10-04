"""The phase 1 acceptance test: two companies coexist without seeing each other.

These tests talk to PostgreSQL through the normal ORM, so they prove the
row-level-security policies (migrations 0003_rls), not just application
filtering.
"""

import pytest
from django.db import ProgrammingError, transaction

from apps.core.models import Branch, Company
from apps.core.tenancy import company_context


@pytest.fixture
def two_companies(db) -> tuple[Company, Company]:
    a = Company.objects.create(legal_name="Financiera A")
    b = Company.objects.create(legal_name="Financiera B")
    with company_context(a.id):
        Branch.objects.create(company=a, code="SD", name="Santo Domingo")
    with company_context(b.id):
        Branch.objects.create(company=b, code="SD", name="Santiago")
    return a, b


def test_no_company_in_session_sees_zero_rows(two_companies: tuple[Company, Company]) -> None:
    assert Branch.objects.count() == 0


def test_each_company_sees_only_its_rows(two_companies: tuple[Company, Company]) -> None:
    a, b = two_companies
    with company_context(a.id):
        branches = list(Branch.objects.all())
        assert len(branches) == 1
        assert branches[0].company_id == a.id
    with company_context(b.id):
        assert Branch.objects.get().name == "Santiago"


def test_cannot_write_rows_for_another_company(two_companies: tuple[Company, Company]) -> None:
    a, b = two_companies
    with company_context(a.id):
        with pytest.raises(ProgrammingError), transaction.atomic():
            Branch.objects.create(company=b, code="XX", name="Intrusa")


def test_cannot_update_across_companies(two_companies: tuple[Company, Company]) -> None:
    a, b = two_companies
    with company_context(a.id):
        # The other company's rows are invisible, so the update touches nothing.
        updated = Branch.objects.filter(company=b).update(name="Hackeada")
        assert updated == 0
    with company_context(b.id):
        assert Branch.objects.get().name == "Santiago"
