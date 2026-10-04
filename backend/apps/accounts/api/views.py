from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts import services
from apps.accounts.api.serializers import (
    InvitationAcceptSerializer,
    InvitationCreateSerializer,
    InvitationDetailSerializer,
)
from apps.accounts.models import Invitation, Membership
from apps.core.tenancy import company_context

# Until the full permission matrix lands, inviting is restricted to the
# company's management roles (doc 06 - section 3: Usuarios -> G, A).
INVITING_ROLES = {"Gerente", "Administrador"}


def _require_company_admin(request: Request) -> None:
    is_admin = Membership.objects.filter(
        user=request.user, role__name__in=INVITING_ROLES
    ).exists()
    if not is_admin:
        raise PermissionDenied("Solo el gerente o el administrador pueden invitar usuarios.")


class InvitationCreateView(APIView):
    def post(self, request: Request) -> Response:
        _require_company_admin(request)
        serializer = InvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            invitation = services.invite_user(
                invited_by=request.user,
                email=data["email"],
                branch=data["branch"],
                role=data["role"],
                accept_url_base=request.build_absolute_uri("/invitacion"),
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
