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
