from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.core.api.views_branches import BranchViewSet
from apps.core.api.views_geography import ProvinceListView

router = DefaultRouter()
router.register("sucursales", BranchViewSet, basename="branch")

urlpatterns = [
    path("provincias/", ProvinceListView.as_view(), name="province-list"),
    path("", include(router.urls)),
]
