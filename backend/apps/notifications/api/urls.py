from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.notifications.api.views import NotificationViewSet
from apps.notifications.api.views_messaging import (
    CustomerMessagesView,
    LogView,
    OptOutView,
    TemplateDetailView,
    TemplatesView,
    TestView,
)

router = DefaultRouter()
router.register("avisos", NotificationViewSet, basename="notification")

urlpatterns = [
    # F18 · P80 (decision 097).
    path("mensajes/", LogView.as_view(), name="messages"),
    path("mensajes/plantillas/", TemplatesView.as_view(), name="message-templates"),
    path("mensajes/plantillas/<uuid:pk>/", TemplateDetailView.as_view(), name="message-template"),
    path("mensajes/prueba/", TestView.as_view(), name="message-test"),
    path("clientes/<uuid:pk>/mensajes/", CustomerMessagesView.as_view(), name="customer-messages"),
    path("clientes/<uuid:pk>/bajas/", OptOutView.as_view(), name="customer-opt-outs"),
    path("", include(router.urls)),
]
