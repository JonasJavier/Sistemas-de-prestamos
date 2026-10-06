from rest_framework import viewsets

from apps.accounts.api.permissions import IsCompanyManagerOrReadOnly
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.api.serializers import BranchSerializer, ReasonSerializer
from apps.core.models import Branch, Reason


class BranchViewSet(viewsets.ModelViewSet):
    """Branches of the caller's company (P71). RLS scopes the queryset.

    No destroy: branches deactivate, never disappear (their code numbers
    documents). Every company user may read (selectors need them); only
    managers write.
    """

    serializer_class = BranchSerializer
    permission_classes = [IsCompanyManagerOrReadOnly, CompanyNotSuspendedOrReadOnly]
    queryset = Branch.objects.order_by("code")
    http_method_names = ["get", "post", "patch", "head", "options"]


class ReasonViewSet(viewsets.ModelViewSet):
    """Reasons catalog (P77): everyone reads it for selectors; G/A edit.

    No destroy: decisions point at their reason; deactivate instead.
    """

    serializer_class = ReasonSerializer
    permission_classes = [IsCompanyManagerOrReadOnly, CompanyNotSuspendedOrReadOnly]
    queryset = Reason.objects.order_by("kind", "text")
    filterset_fields = ["kind", "is_active"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]
