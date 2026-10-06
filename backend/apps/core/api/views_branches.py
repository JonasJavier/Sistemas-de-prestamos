from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.api.permissions import IsCompanyManager, IsCompanyManagerOrReadOnly
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.api.serializers import (
    BranchSerializer,
    HolidaySerializer,
    ReasonSerializer,
    SequenceSerializer,
)
from apps.core.holidays import seed_year
from apps.core.models import Branch, Holiday, Reason, Sequence


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


class HolidayViewSet(viewsets.ModelViewSet):
    """P75 «Feriados»: confirm the movable ones, add the religious ones.

    Holidays are configuration, not money: they may be deleted. Loans
    already disbursed keep their frozen dates; new schedules use the list.
    """

    serializer_class = HolidaySerializer
    permission_classes = [IsCompanyManagerOrReadOnly, CompanyNotSuspendedOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = Holiday.objects.order_by("date")
        year = self.request.query_params.get("year")
        if year and year.isdigit():
            queryset = queryset.filter(date__year=int(year))
        return queryset

    @action(detail=False, methods=["post"])
    def sembrar(self, request: Request) -> Response:
        """Add the Dominican holidays of a year that are still missing."""
        year = str(request.data.get("year", ""))
        current = timezone.localdate().year
        if not year.isdigit() or not current - 1 <= int(year) <= current + 2:
            return Response(
                {"year": "Elige un año entre el pasado y dos años adelante."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        added = seed_year(request.user.company_id, int(year))
        return Response({"added": added}, status=status.HTTP_201_CREATED)


class SequenceViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """P75 «Numeraciones»: prefixes per branch and document (decision 030).

    The counter itself is never editable: numbering stays gapless.
    """

    serializer_class = SequenceSerializer
    permission_classes = [IsCompanyManager, CompanyNotSuspendedOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "patch", "head", "options"]
    queryset = Sequence.objects.select_related("branch").order_by("branch__code", "doc_type")
