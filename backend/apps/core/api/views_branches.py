from rest_framework import viewsets

from apps.accounts.api.permissions import IsCompanyManagerOrReadOnly
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.api.serializers import BranchSerializer
from apps.core.models import Branch


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
