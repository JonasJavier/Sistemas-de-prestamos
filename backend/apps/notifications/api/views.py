"""P11: my notices (the bell) and the badges of the top bar."""

from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "kind_label", "text", "link", "read_at", "created_at"]


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        queryset = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("sin_leer"):
            queryset = queryset.filter(read_at__isnull=True)
        return queryset.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def leido(self, request: Request, pk: str | None = None) -> Response:
        Notification.objects.filter(user=request.user, pk=pk, read_at__isnull=True).update(
            read_at=timezone.now()
        )
        return Response({"ok": True})

    @action(detail=False, methods=["post"], url_path="leer-todos")
    def read_all(self, request: Request) -> Response:
        count = Notification.objects.filter(user=request.user, read_at__isnull=True).update(
            read_at=timezone.now()
        )
        return Response({"read": count})
