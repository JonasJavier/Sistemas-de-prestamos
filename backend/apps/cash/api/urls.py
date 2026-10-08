from django.urls import path

from apps.cash.api.views import (
    CloseView,
    MoveView,
    MyCashView,
    OpenView,
    RoutePdfView,
    SessionDetailView,
    SessionPdfView,
    SessionsView,
    SettleView,
)

urlpatterns = [
    path("caja/", MyCashView.as_view(), name="my-cash"),
    path("caja/abrir/", OpenView.as_view(), name="cash-open"),
    path("caja/mover/", MoveView.as_view(), name="cash-move"),
    path("caja/cerrar/", CloseView.as_view(), name="cash-close"),
    path("cajas/", SessionsView.as_view(), name="cash-sessions"),
    path("cajas/<uuid:pk>/", SessionDetailView.as_view(), name="cash-session"),
    path("cajas/<uuid:pk>/pdf/", SessionPdfView.as_view(), name="cash-session-pdf"),
    path("rendiciones/<uuid:pk>/", SettleView.as_view(), name="route-settle"),
    path("rendiciones/<uuid:pk>/pdf/", RoutePdfView.as_view(), name="route-settle-pdf"),
]
