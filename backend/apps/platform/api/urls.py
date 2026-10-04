from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.platform.api.views import CompanyViewSet, MyCompanyView, RegistrationView

router = DefaultRouter()
router.register("plataforma/empresas", CompanyViewSet, basename="platform-company")

urlpatterns = [
    path("registro/", RegistrationView.as_view(), name="company-registration"),
    path("mi-empresa/", MyCompanyView.as_view(), name="my-company"),
    path("", include(router.urls)),
]
