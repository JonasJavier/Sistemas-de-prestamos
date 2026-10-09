from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.core.api.views_branches import (
    BranchViewSet,
    HolidayViewSet,
    ReasonViewSet,
    SequenceViewSet,
)
from apps.core.api.views_company import CompanyLogoView, CompanySettingsView
from apps.core.api.views_geography import ProvinceListView

router = DefaultRouter()
router.register("sucursales", BranchViewSet, basename="branch")
router.register("motivos", ReasonViewSet, basename="reason")
router.register("feriados", HolidayViewSet, basename="holiday")
router.register("numeraciones", SequenceViewSet, basename="sequence")

urlpatterns = [
    path("provincias/", ProvinceListView.as_view(), name="province-list"),
    path("ajustes/empresa/", CompanySettingsView.as_view(), name="company-settings"),
    path("ajustes/empresa/logo/", CompanyLogoView.as_view(), name="company-logo"),
    path("", include(router.urls)),
]
