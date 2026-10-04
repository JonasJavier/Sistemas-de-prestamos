from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.core.api.views_branches import BranchViewSet

router = DefaultRouter()
router.register("sucursales", BranchViewSet, basename="branch")

urlpatterns = [path("", include(router.urls))]
