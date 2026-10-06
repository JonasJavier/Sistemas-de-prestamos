from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.lending.api.views import LoanProductViewSet, ProductChargeViewSet, SimulateView
from apps.lending.api.views_origination import (
    ApplicationCollateralViewSet,
    ApplicationFileViewSet,
    ApplicationViewSet,
    BudgetItemViewSet,
    GuarantorViewSet,
    LoanViewSet,
    RequirementViewSet,
)

router = DefaultRouter()
router.register("productos", LoanProductViewSet, basename="loan-product")
router.register("cargos-producto", ProductChargeViewSet, basename="product-charge")
router.register("solicitudes", ApplicationViewSet, basename="application")
router.register("solicitud-presupuesto", BudgetItemViewSet, basename="application-budget")
router.register("solicitud-garantes", GuarantorViewSet, basename="application-guarantor")
router.register(
    "solicitud-garantias", ApplicationCollateralViewSet, basename="application-collateral"
)
router.register("solicitud-requisitos", RequirementViewSet, basename="application-requirement")
router.register("solicitud-archivos", ApplicationFileViewSet, basename="application-file")
router.register("prestamos", LoanViewSet, basename="loan")

urlpatterns = [
    path("simulador/", SimulateView.as_view(), name="simulate"),
    path("", include(router.urls)),
]
