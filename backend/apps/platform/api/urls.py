from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.platform.api.views import (
    CompanyViewSet,
    MyCompanyView,
    PlanViewSet,
    RegistrationView,
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

urlpatterns = [
    path("registro/", RegistrationView.as_view(), name="company-registration"),
    path("mi-empresa/", MyCompanyView.as_view(), name="my-company"),
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
