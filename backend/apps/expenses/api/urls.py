from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.expenses.api.views import CategoryViewSet, ExpenseViewSet
from apps.expenses.api.views_payables import PayableViewSet

router = DefaultRouter()
router.register("categorias-gasto", CategoryViewSet, basename="expense-category")
router.register("gastos", ExpenseViewSet, basename="expense")
router.register("cuentas-por-pagar", PayableViewSet, basename="payable")

urlpatterns = [path("", include(router.urls))]
