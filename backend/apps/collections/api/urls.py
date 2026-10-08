from django.urls import path

from apps.collections.api.views import (
    AssignView,
    ConsentView,
    CustomerLocationView,
    MyRouteView,
    OpenRouteView,
    PingView,
    ReorderView,
    RouteMapView,
    RoutesView,
    VisitView,
)

urlpatterns = [
    path("ruta/", MyRouteView.as_view(), name="my-route"),
    path("ruta/consentimiento/", ConsentView.as_view(), name="route-consent"),
    path("ruta/abrir/", OpenRouteView.as_view(), name="route-open"),
    path("ruta/orden/", ReorderView.as_view(), name="route-order"),
    path("ruta/ubicacion/", PingView.as_view(), name="route-ping"),
    path("rutas/", RoutesView.as_view(), name="routes"),
    path("rutas/asignar/", AssignView.as_view(), name="routes-assign"),
    path("rutas/<uuid:collector_id>/mapa/", RouteMapView.as_view(), name="routes-map"),
    path("prestamos/<str:number>/gestiones/", VisitView.as_view(), name="loan-visits"),
    path(
        "prestamos/<str:number>/ubicacion-cliente/",
        CustomerLocationView.as_view(),
        name="loan-customer-location",
    ),
]
