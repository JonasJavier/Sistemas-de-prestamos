from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.ledger.api.views import FinancialAccountViewSet

router = DefaultRouter()
router.register("cuentas", FinancialAccountViewSet, basename="financial-account")

urlpatterns = [path("", include(router.urls))]
