"""Tenant context: which company the current database work belongs to.

The PostgreSQL session variable ``app.current_company`` drives the
row-level-security policies created in the RLS migrations (doc 01 - section 4,
principle 9). The ORM still filters by company explicitly in the API layer;
RLS is the barrier that remains if application code gets it wrong.

Rules:
- HTTP requests: ``TenantMiddleware`` sets the variable from the
  authenticated user's company and always resets it afterwards, so a
  pooled connection can never leak a tenant into the next request.
- Celery tasks and scripts: wrap the work in ``company_context(...)``.
- A connection with no company set sees *zero* rows in protected tables.
"""

from collections.abc import Callable
from contextlib import contextmanager
from typing import TYPE_CHECKING
from uuid import UUID

from django.db import connection
from django.http import HttpRequest, HttpResponse

if TYPE_CHECKING:
    from collections.abc import Iterator

SESSION_VAR = "app.current_company"


def set_current_company(company_id: UUID | str) -> None:
    with connection.cursor() as cursor:
        # set_config with is_local=false: survives for the whole session,
        # but is rolled back with the surrounding transaction (tests).
        cursor.execute("SELECT set_config(%s, %s, false)", [SESSION_VAR, str(company_id)])


def clear_current_company() -> None:
    with connection.cursor() as cursor:
        cursor.execute(f"RESET {SESSION_VAR}")


@contextmanager
def company_context(company_id: UUID | str) -> Iterator[None]:
    """Run a block of ORM work as one tenant. Use in tasks, seeds and tests."""
    set_current_company(company_id)
    try:
        yield
    finally:
        clear_current_company()


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
