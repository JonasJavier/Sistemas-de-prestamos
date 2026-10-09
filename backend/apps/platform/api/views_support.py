"""PT4 «Modo soporte» and PT2 «Tablero de la plataforma» (decision 091).

The platform side grants, enters, leaves and revokes support access; the
company side sees every grant and every screen support read, and may
revoke an active grant.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.models import Company
from apps.platform import metrics, support
from apps.platform.api.permissions import IsPlatformAdmin
from apps.platform.models import SupportAccessGrant

CanSeeSupport = role_required(authz.GERENTE, authz.ADMINISTRADOR, read_any=False)


def _fail(exc: support.SupportError) -> Response:
    code = status.HTTP_403_FORBIDDEN if exc.code == "forbidden" else status.HTTP_400_BAD_REQUEST
    return Response({"detail": exc.message, "code": exc.code}, status=code)


def _grant(access: SupportAccessGrant) -> dict:
    return {
        "id": str(access.id),
        "company": str(access.company_id),
        "reason": access.reason,
        "starts_at": access.starts_at,
        "ends_at": access.ends_at,
        "revoked_at": access.revoked_at,
        "active": support.is_active(access),
    }


class CompanyGrantsView(APIView):
    """The company's grants (GET) and a new one (POST), from its file (PT1)."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request: Request, pk) -> Response:
        company = get_object_or_404(Company, pk=pk)
        grants = SupportAccessGrant.objects.filter(company=company).order_by("-starts_at")
        return Response([_grant(g) for g in grants])

    def post(self, request: Request, pk) -> Response:
        company = get_object_or_404(Company, pk=pk)
        try:
            hours = int(request.data.get("hours", support.DEFAULT_HOURS))
        except TypeError, ValueError:
            hours = 0
        try:
            access = support.grant(
                company=company,
                admin=request.user,
                reason=str(request.data.get("reason", "")),
                hours=hours,
            )
        except support.SupportError as exc:
            return _fail(exc)
        return Response(_grant(access), status=status.HTTP_201_CREATED)


class EnterView(APIView):
    permission_classes = [IsPlatformAdmin]

    def post(self, request: Request, pk) -> Response:
        access = get_object_or_404(SupportAccessGrant, pk=pk)
        try:
            support.enter(request, access)
        except support.SupportError as exc:
            return _fail(exc)
        return Response(_grant(access))


class LeaveView(APIView):
    permission_classes = [IsPlatformAdmin]

    def post(self, request: Request) -> Response:
        support.leave(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlatformRevokeView(APIView):
    permission_classes = [IsPlatformAdmin]

    def post(self, request: Request, pk) -> Response:
        access = get_object_or_404(SupportAccessGrant, pk=pk)
        try:
            access = support.revoke(access=access, user=request.user)
        except support.SupportError as exc:
            return _fail(exc)
        return Response(_grant(access))


class CompanySupportView(APIView):
    """Ajustes: «Soporte de Cobradía tiene acceso de lectura hasta …», the
    history of grants and every screen support opened."""

    permission_classes = [IsAuthenticated, CanSeeSupport]

    def get(self, request: Request) -> Response:
        from apps.audit.models import SensitiveAccessLog

        grants = SupportAccessGrant.objects.filter(company_id=request.user.company_id).order_by(
            "-starts_at"
        )
        reads = SensitiveAccessLog.objects.filter(
            action=SensitiveAccessLog.Action.SUPPORT_READ
        ).order_by("-created_at")[:100]
        active = next((g for g in grants if support.is_active(g)), None)
        return Response(
            {
                "active": _grant(active) if active else None,
                "grants": [_grant(g) for g in grants[:20]],
                "reads": [{"at": r.created_at, "path": r.detail} for r in reads],
            }
        )


class CompanyRevokeView(APIView):
    permission_classes = [IsAuthenticated, CanSeeSupport]

    def post(self, request: Request, pk) -> Response:
        access = get_object_or_404(SupportAccessGrant, pk=pk, company_id=request.user.company_id)
        try:
            access = support.revoke(access=access, user=request.user)
        except support.SupportError as exc:
            return _fail(exc)
        return Response(_grant(access))


class PlatformDashboardView(APIView):
    """PT2: companies, the trial's conversion, signups, payments due and
    usage counts. Never a customer, a loan or an amount of a company."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request: Request) -> Response:
        return Response(metrics.dashboard())
