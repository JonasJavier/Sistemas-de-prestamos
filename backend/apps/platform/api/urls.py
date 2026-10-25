from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.platform.api.views import (
    CompanyViewSet,
    MyCompanyView,
    PlanViewSet,
    PublicPlansView,
    RegistrationView,
)
from apps.platform.api.views_billing import (
    BankAccountViewSet,
    CompanyPaymentView,
    CompanyProofFileView,
    CompanyProofView,
    ProofViewSet,
)
from apps.platform.api.views_support import (
    CompanyGrantsView,
    CompanyRevokeView,
    CompanySupportView,
    EnterView,
    LeaveView,
    PlatformDashboardView,
    PlatformRevokeView,
)

router = DefaultRouter()
router.register("plataforma/empresas", CompanyViewSet, basename="platform-company")
router.register("plataforma/planes", PlanViewSet, basename="platform-plan")
router.register("plataforma/comprobantes", ProofViewSet, basename="platform-proof")
router.register("plataforma/cuentas-bancarias", BankAccountViewSet, basename="platform-bank")

urlpatterns = [
    path("registro/", RegistrationView.as_view(), name="company-registration"),
    path("mi-empresa/", MyCompanyView.as_view(), name="my-company"),
    path("planes/", PublicPlansView.as_view(), name="public-plans"),
    path("mi-empresa/pago/", CompanyPaymentView.as_view(), name="company-payment"),
    path("mi-empresa/pago/comprobantes/", CompanyProofView.as_view(), name="company-proof"),
    path(
        "mi-empresa/pago/comprobantes/<uuid:pk>/archivo/",
        CompanyProofFileView.as_view(),
        name="company-proof-file",
    ),
    path("plataforma/tablero/", PlatformDashboardView.as_view(), name="platform-dashboard"),
    path(
        "plataforma/empresas/<uuid:pk>/soporte/",
        CompanyGrantsView.as_view(),
        name="platform-support-grants",
    ),
    path("plataforma/soporte/salir/", LeaveView.as_view(), name="platform-support-leave"),
    path(
        "plataforma/soporte/<uuid:pk>/entrar/", EnterView.as_view(), name="platform-support-enter"
    ),
    path(
        "plataforma/soporte/<uuid:pk>/revocar/",
        PlatformRevokeView.as_view(),
        name="platform-support-revoke",
    ),
    path("ajustes/soporte/", CompanySupportView.as_view(), name="company-support"),
    path(
        "ajustes/soporte/<uuid:pk>/revocar/",
        CompanyRevokeView.as_view(),
        name="company-support-revoke",
    ),
    path("", include(router.urls)),
]
