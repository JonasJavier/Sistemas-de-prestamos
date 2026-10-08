from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts import authz, services
from apps.accounts.api.permissions import IsCompanyManager, is_company_manager
from apps.accounts.api.serializers import (
    CompanyUserSerializer,
    InvitationAcceptSerializer,
    InvitationCreateSerializer,
    InvitationDetailSerializer,
    PendingInvitationSerializer,
    RoleSerializer,
)
from apps.accounts.models import Invitation, Membership, Role, User
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.tenancy import company_context


def _badges(user: User) -> dict:
    """The bell and the check of the top bar, and what the user has open."""
    from apps.cash.models import CashSession
    from apps.cash.services import open_route_of, open_session_of
    from apps.core.models import ApprovalRequest
    from apps.notifications.models import Notification
    from apps.payments.reversals import can_decide

    session = open_session_of(user)
    pending = ApprovalRequest.objects.filter(
        status=ApprovalRequest.Status.PENDING, expires_at__gt=timezone.now()
    ).exclude(requested_by=user)
    closings = CashSession.objects.filter(status=CashSession.Status.CLOSED).exclude(cashier=user)
    scope = authz.branch_scope(user)
    if scope is not None:
        closings = closings.filter(branch_id__in=scope)
    can_approve_closings = authz.has_any_role(user, authz.GERENTE, authz.SUPERVISOR)
    return {
        "unread_notifications": Notification.objects.filter(
            user=user, read_at__isnull=True
        ).count(),
        "pending_approvals": sum(1 for item in pending if can_decide(user, item)),
        "closings_to_approve": closings.count() if can_approve_closings else 0,
        "cash_session": None
        if session is None
        else {"id": str(session.id), "number": session.number},
        "route_open": open_route_of(user) is not None,
    }


class MeView(APIView):
    """Who am I: the SPA decides tenant vs platform navigation with this."""

    def get(self, request: Request) -> Response:
        from allauth.mfa.models import Authenticator
        from django.conf import settings

        user = request.user
        mfa_enabled = Authenticator.objects.filter(user=user, type=Authenticator.Type.TOTP).exists()
        roles: list[str] = []
        if user.company_id:
            roles = sorted(
                Membership.objects.filter(user=user).values_list("role__name", flat=True).distinct()
            )
        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "is_platform_admin": user.is_platform_admin,
                "is_manager": is_company_manager(request) if user.company_id else False,
                "roles": roles,
                "company_id": str(user.company_id) if user.company_id else None,
                # Company is a global table (no RLS): its name and state frame the shell.
                "company_name": str(user.company) if user.company_id else None,
                "company_status": user.company.status if user.company_id else None,
                "mfa_enabled": mfa_enabled,
                "mfa_required": settings.REQUIRE_MFA,
                "location_consent": user.location_consent_at is not None,
                **(_badges(user) if user.company_id else {}),
            }
        )


class RoleListView(APIView):
    """Roles of the caller's company, for the invitation form (RLS scopes it)."""

    def get(self, request: Request) -> Response:
        roles = Role.objects.order_by("name")
        return Response(RoleSerializer(roles, many=True).data)


class CompanyUserViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Users of the caller's company (P72). Managers only."""

    permission_classes = [IsCompanyManager, CompanyNotSuspendedOrReadOnly]
    serializer_class = CompanyUserSerializer

    def get_queryset(self):
        return (
            User.objects.filter(company_id=self.request.user.company_id)
            .prefetch_related("memberships__branch", "memberships__role")
            .order_by("email")
        )

    def _set_active(self, request: Request, pk: str, active: bool) -> Response:
        user = self.get_queryset().get(pk=pk)
        if user == request.user:
            raise ValidationError({"detail": "No puedes desactivar tu propia cuenta."})
        user.is_active = active
        user.save(update_fields=["is_active"])
        return Response(CompanyUserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request: Request, pk: str) -> Response:
        return self._set_active(request, pk, active=False)

    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: str) -> Response:
        return self._set_active(request, pk, active=True)


class PendingInvitationsView(APIView):
    """Open invitations of the company, with revocation (F17)."""

    permission_classes = [IsCompanyManager, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request, pk: str | None = None) -> Response:
        pending = (
            Invitation.objects.filter(
                company_id=request.user.company_id,
                accepted_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .select_related("branch", "role", "invited_by")
            .order_by("-created_at")
        )
        return Response(PendingInvitationSerializer(pending, many=True).data)

    def delete(self, request: Request, pk: str) -> Response:
        Invitation.objects.filter(
            company_id=request.user.company_id, pk=pk, accepted_at__isnull=True
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationCreateView(APIView):
    permission_classes = [IsCompanyManager, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        serializer = InvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            from django.conf import settings

            accept_url_base = (
                f"{settings.FRONTEND_URL}/invitacion"
                if settings.FRONTEND_URL
                else request.build_absolute_uri("/invitacion")
            )
            invitation = services.invite_user(
                invited_by=request.user,
                email=data["email"],
                branch=data["branch"],
                role=data["role"],
                accept_url_base=accept_url_base,
            )
        except services.InvitationError as exc:
            raise ValidationError({"email": str(exc)}) from exc
        return Response({"id": str(invitation.id)}, status=status.HTTP_201_CREATED)


class InvitationPublicView(APIView):
    """The acceptance page reads the invitation by its secret token."""

    permission_classes = [AllowAny]
    authentication_classes: list[type] = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invitation"

    def get(self, request: Request, token: str) -> Response:
        try:
            invitation = Invitation.objects.get(token=token, accepted_at__isnull=True)
        except Invitation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        with company_context(invitation.company_id):
            data = InvitationDetailSerializer(invitation).data
        return Response(data)


class InvitationAcceptView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list[type] = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invitation"

    def post(self, request: Request, token: str) -> Response:
        serializer = InvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = services.accept_invitation(token=token, **serializer.validated_data)
        except services.InvitationError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            {"detail": "Cuenta creada. Ya puedes iniciar sesión.", "email": user.email},
            status=status.HTTP_201_CREATED,
        )


class WorkingHoursView(APIView):
    """Decision 035: who works within the branch hours right now, and a
    temporary extension granted by the supervisor (audited)."""

    def _staff(self, request: Request) -> list[User]:
        from apps.accounts.hours import is_restricted

        scope = authz.branch_scope(request.user)
        memberships = Membership.objects.filter(
            role__name__in=[authz.CAJERO, authz.COBRADOR], user__is_active=True
        ).select_related("user")
        if scope is not None:
            memberships = memberships.filter(branch_id__in=scope)
        users = {m.user_id: m.user for m in memberships}
        return [u for u in users.values() if u.pk != request.user.pk and is_restricted(u)]

    def get(self, request: Request) -> Response:
        from apps.accounts.hours import outside_hours
        from apps.accounts.models import HoursExtension

        if not authz.has_any_role(request.user, authz.GERENTE, authz.SUPERVISOR):
            return Response(status=status.HTTP_403_FORBIDDEN)
        now = timezone.now()
        rows = []
        for user in self._staff(request):
            extension = (
                HoursExtension.objects.filter(user=user, until__gt=now).order_by("-until").first()
            )
            rows.append(
                {
                    "id": str(user.id),
                    "name": user.get_full_name() or user.email,
                    "outside_hours": outside_hours(user) is not None,
                    "extended_until": extension.until if extension else None,
                }
            )
        return Response(rows)

    def post(self, request: Request) -> Response:
        from apps.accounts.hours import extend

        user = User.objects.filter(
            pk=request.data.get("user"), company_id=request.user.company_id
        ).first()
        if user is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            minutes = int(request.data.get("minutes", 0))
            extension = extend(
                user=user,
                granted_by=request.user,
                minutes=minutes,
                note=str(request.data.get("note", "")),
            )
        except PermissionError as exc:
            return Response({"detail": str(exc), "code": "forbidden"}, status=403)
        except ValueError as exc:
            return Response({"detail": str(exc), "code": "invalid"}, status=400)
        return Response({"until": extension.until}, status=status.HTTP_201_CREATED)
