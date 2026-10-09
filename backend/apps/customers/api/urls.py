from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.customers.api.views import CustomerViewSet
from apps.customers.api.views_expediente import (
    CollateralFileViewSet,
    CollateralViewSet,
    CustomerBusinessView,
    CustomerEmploymentView,
    CustomerFileViewSet,
    ReferenceViewSet,
    RelativeViewSet,
    SignedFileDownloadView,
)
from apps.customers.api.views_portal import (
    CodeView,
    EnterView,
    InviteView,
    LeaveView,
    LoanView,
    MeView,
    StatementView,
)
from apps.customers.api.views_search import GlobalSearchView

router = DefaultRouter()
router.register("clientes", CustomerViewSet, basename="customer")
router.register("familiares", RelativeViewSet, basename="relative")
router.register("referencias", ReferenceViewSet, basename="reference")
router.register("archivos", CustomerFileViewSet, basename="customer-file")
router.register("archivos-garantia", CollateralFileViewSet, basename="collateral-file")
router.register("garantias", CollateralViewSet, basename="collateral")

urlpatterns = [
    path("buscar/", GlobalSearchView.as_view(), name="global-search"),
    path(
        "archivos/descarga/<str:token>/",
        SignedFileDownloadView.as_view(),
        name="customer-file-signed-download",
    ),
    path(
        "clientes/<uuid:pk>/empleo/",
        CustomerEmploymentView.as_view(),
        name="customer-employment",
    ),
    path(
        "clientes/<uuid:pk>/negocio/",
        CustomerBusinessView.as_view(),
        name="customer-business",
    ),
    path("clientes/<uuid:pk>/portal/", InviteView.as_view(), name="customer-portal"),
    # P92–P93 (decision 099): the customer's own portal.
    path("publico/portal/codigo/", CodeView.as_view(), name="portal-code"),
    path("publico/portal/entrar/", EnterView.as_view(), name="portal-enter"),
    path("publico/portal/salir/", LeaveView.as_view(), name="portal-leave"),
    path("publico/portal/yo/", MeView.as_view(), name="portal-me"),
    path("publico/portal/prestamos/<str:number>/", LoanView.as_view(), name="portal-loan"),
    path(
        "publico/portal/prestamos/<str:number>/estado-de-cuenta/",
        StatementView.as_view(),
        name="portal-statement",
    ),
    path("", include(router.urls)),
]
