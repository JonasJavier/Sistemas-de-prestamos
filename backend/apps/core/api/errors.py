"""One shape for a refused business rule: ``{"detail", "code"}``.

403 when the rule is about who (role, branch), 400 otherwise, so the SPA
shows the message next to the action instead of a generic error.
"""

from rest_framework import status
from rest_framework.response import Response

FORBIDDEN_CODES = {"forbidden", "out_of_scope"}


def fail(exc: Exception) -> Response:
    code = getattr(exc, "code", "invalid")
    http = status.HTTP_403_FORBIDDEN if code in FORBIDDEN_CODES else status.HTTP_400_BAD_REQUEST
    return Response({"detail": str(exc), "code": code}, status=http)


def person(user) -> str | None:
    return (user.get_full_name() or user.email) if user else None


def exception_handler(exc: Exception, context: dict) -> Response | None:
    """DRF's handler, plus: a ledger rule nobody caught (no overdraft, a
    closed month) answers 400 with its message instead of a 500, and the
    request's transaction is rolled back like any refused request."""
    from rest_framework.views import exception_handler as drf_handler
    from rest_framework.views import set_rollback

    from apps.ledger.services import LedgerError

    if isinstance(exc, LedgerError):
        set_rollback()
        return fail(exc)
    return drf_handler(exc, context)
