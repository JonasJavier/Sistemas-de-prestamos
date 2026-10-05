from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.lending.api.views import LoanProductViewSet, ProductChargeViewSet, SimulateView

router = DefaultRouter()
router.register("productos", LoanProductViewSet, basename="loan-product")
router.register("cargos-producto", ProductChargeViewSet, basename="product-charge")

urlpatterns = [
    path("simulador/", SimulateView.as_view(), name="simulate"),
    path("", include(router.urls)),
]
