"""The phase 1 acceptance test: two companies coexist without seeing each other.

Isolation has two independent barriers (``apps.core.tenancy``). Tests that
go through ``Branch._base_manager`` (no tenant filter) prove barrier 2, the
row-level-security policies of the RLS migrations; tests that switch RLS
off inside their own transaction prove barrier 1, the ORM filter.
"""

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import ProgrammingError, connection, transaction

from apps.core import tenancy
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
    assert Branch._base_manager.count() == 0


def test_each_company_sees_only_its_rows(two_companies: tuple[Company, Company]) -> None:
    a, b = two_companies
    with company_context(a.id):
        branches = list(Branch._base_manager.all())
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
        updated = Branch._base_manager.filter(company=b).update(name="Hackeada")
        assert updated == 0
    with company_context(b.id):
        assert Branch.objects.get().name == "Santiago"


def _without_rls(table: str) -> None:
    """Switch the policy off for this test's transaction only (DDL rolls back)."""
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # flush deferred FK checks first
        cursor.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        cursor.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def test_orm_isolates_companies_even_without_rls(two_companies: tuple[Company, Company]) -> None:
    """Barrier 1 alone: if RLS were bypassed, the ORM still filters by company."""
    a, b = two_companies
    _without_rls("core_branch")
    with company_context(a.id):
        assert Branch._base_manager.count() == 2  # RLS really is off
        assert [branch.name for branch in Branch.objects.all()] == ["Santo Domingo"]
        assert Branch.objects.filter(company=b).update(name="Hackeada") == 0
    assert Branch.objects.count() == 0  # no tenant, no rows


def test_querysets_built_ahead_resolve_the_tenant_when_run(
    two_companies: tuple[Company, Company],
) -> None:
    """Serializer fields build their queryset at import time, before any tenant."""
    a, b = two_companies
    ahead = Branch.objects.all()
    with company_context(a.id):
        assert ahead.all().get().name == "Santo Domingo"
    with company_context(b.id):
        assert ahead.all().get().name == "Santiago"


def test_nested_context_restores_the_outer_tenant(two_companies: tuple[Company, Company]) -> None:
    a, b = two_companies
    with company_context(a.id):
        with company_context(b.id):
            assert Branch.objects.get().name == "Santiago"
        assert Branch.objects.get().name == "Santo Domingo"


def test_a_database_role_that_bypasses_rls_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    class PrivilegedCursor:
        def execute(self, *args: object) -> None:
            pass

        def fetchone(self) -> tuple[bool]:
            return (True,)

    monkeypatch.setattr(tenancy, "_role_checked", False)
    with pytest.raises(ImproperlyConfigured):
        tenancy._refuse_privileged_role(PrivilegedCursor())


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
