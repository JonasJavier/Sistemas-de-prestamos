"""Tenant context: which company the current database work belongs to.

Two independent barriers keep each company's data apart (decision 042,
doc 01 - section 4, principle 9):

1. **The ORM filters first.** ``TenantManager`` adds ``company_id = <tenant>``
   to every query of a company-scoped model. The tenant is read when the
   SQL is compiled, not when the queryset is built, so class-level
   querysets (serializer fields, ``queryset = ...`` in views) stay correct.
2. **PostgreSQL row-level security** reads the session variable
   ``app.current_company``; it is the barrier that remains if application
   code gets it wrong. ``set_current_company`` refuses to run on a database
   role that would skip it (superuser or BYPASSRLS).

Rules:
- HTTP requests: ``TenantMiddleware`` sets the tenant from the
  authenticated user's company and always resets it afterwards, so a
  pooled connection can never leak a tenant into the next request.
- Celery tasks and scripts: wrap the work in ``company_context(...)``.
- With no company set, both barriers return *zero* rows.
"""

from collections.abc import Callable
from contextlib import contextmanager
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured
from django.db import connection, models
from django.http import HttpRequest, HttpResponse

if TYPE_CHECKING:
    from collections.abc import Iterator

SESSION_VAR = "app.current_company"

_current_company: ContextVar[UUID | None] = ContextVar("current_company", default=None)
_role_checked = False


def current_company_id() -> UUID | None:
    return _current_company.get()


def _refuse_privileged_role(cursor: Any) -> None:
    """Once per process: a role that bypasses RLS would silently void barrier 2."""
    global _role_checked
    if _role_checked:
        return
    cursor.execute("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")
    row = cursor.fetchone()
    if row and row[0]:
        raise ImproperlyConfigured(
            "La base de datos usa un rol que ignora RLS (superusuario o BYPASSRLS). "
            "La aplicación debe conectarse con un rol sin esos privilegios (doc 06 - 8)."
        )
    _role_checked = True


def set_current_company(company_id: UUID | str) -> None:
    company_uuid = company_id if isinstance(company_id, UUID) else UUID(str(company_id))
    with connection.cursor() as cursor:
        _refuse_privileged_role(cursor)
        # set_config with is_local=false: survives for the whole session,
        # but is rolled back with the surrounding transaction (tests).
        cursor.execute("SELECT set_config(%s, %s, false)", [SESSION_VAR, str(company_uuid)])
    _current_company.set(company_uuid)


def clear_current_company() -> None:
    with connection.cursor() as cursor:
        cursor.execute(f"RESET {SESSION_VAR}")
    _current_company.set(None)


@contextmanager
def company_context(company_id: UUID | str) -> Iterator[None]:
    """Run a block of ORM work as one tenant. Use in tasks, seeds and tests.

    On exit the previous tenant (if any) is restored, so a nested block
    never leaves the outer request without its company.
    """
    previous = _current_company.get()
    set_current_company(company_id)
    try:
        yield
    finally:
        if previous is None:
            clear_current_company()
        else:
            set_current_company(previous)


def on_commit_in_tenant(company_id: UUID, func: Callable[[], Any]) -> None:
    """Run ``func`` after the transaction commits, inside ``company_id``'s
    context: the commit may happen after the code that registered it has
    left its tenant (a command, a task), and RLS would hide every row."""
    from django.db import transaction

    def run() -> None:
        with company_context(company_id):
            func()

    transaction.on_commit(run, robust=True)


class CurrentCompany(models.Expression):
    """The running tenant, resolved when the query is compiled.

    With no tenant it compiles to NULL, and ``company_id = NULL`` matches
    nothing: the same answer RLS gives.
    """

    output_field = models.UUIDField()

    def as_sql(self, compiler: Any, connection: Any) -> tuple[str, list[Any]]:
        company_id = _current_company.get()
        if company_id is None:
            return "NULL", []
        return "%s", [company_id]


class TenantManager(models.Manager):
    """Default manager of every company-scoped model (barrier 1)."""

    def get_queryset(self) -> models.QuerySet:
        return super().get_queryset().filter(company_id=CurrentCompany())


class TenantMiddleware:
    """Binds the request's database session to the user's company.

    Must run after AuthenticationMiddleware. Platform-admin users have no
    company: they operate only on global tables unless a support-access
    flow explicitly sets a company for them (phase 7).
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        company_id = (
            getattr(request.user, "company_id", None) if request.user.is_authenticated else None
        )
        request.company_id = company_id  # type: ignore[attr-defined]
        if company_id is None:
            return self.get_response(request)
        set_current_company(company_id)
        try:
            return self.get_response(request)
        finally:
            clear_current_company()
