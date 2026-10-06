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


# Tables that carry company_id on purpose WITHOUT the tenant policy; each
# one is documented where it is created (accounts 0003/0004, platform).
RLS_EXEMPT = {
    "accounts_user",  # login looks users up by email before any tenant
    "accounts_userevent",
    "accounts_invitation",  # the public token lookup is the credential
    "accounts_invitationevent",
    "platform_subscription",  # platform-owned (doc 05 - 4.0)
    "platform_subscriptionevent",
    "platform_supportaccessgrant",
    "platform_supportaccessgrantevent",
}


def test_every_company_table_has_forced_rls(db) -> None:
    """Doc 05 - section 7, rule 11: RLS on EVERY table with a company,
    pghistory copies included. A new model without its RLS migration
    fails here instead of leaking across tenants."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.relname, c.relrowsecurity AND c.relforcerowsecurity
              FROM pg_class c
              JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
             WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
            """
        )
        unprotected = sorted(table for table, protected in cursor.fetchall() if not protected)
    assert [t for t in unprotected if t not in RLS_EXEMPT] == []
