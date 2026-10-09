from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.ledger.api.views import FinancialAccountViewSet
from apps.ledger.api.views_accounting import (
    AccountLedgerView,
    BalanceSheetView,
    ChartDetailView,
    ChartView,
    IncomeStatementView,
    JournalView,
    ManualEntryView,
    PeriodsView,
    TrialBalanceView,
)

router = DefaultRouter()
router.register("cuentas", FinancialAccountViewSet, basename="financial-account")

urlpatterns = [
    path("contabilidad/cuentas/", ChartView.as_view(), name="chart"),
    path("contabilidad/cuentas/<uuid:pk>/", ChartDetailView.as_view(), name="chart-detail"),
    path(
        "contabilidad/cuentas/<uuid:pk>/mayor/", AccountLedgerView.as_view(), name="account-ledger"
    ),
    path("contabilidad/diario/", JournalView.as_view(), name="journal"),
    path("contabilidad/balanza/", TrialBalanceView.as_view(), name="trial-balance"),
    path("contabilidad/resultados/", IncomeStatementView.as_view(), name="income-statement"),
    path("contabilidad/balance/", BalanceSheetView.as_view(), name="balance-sheet"),
    path("contabilidad/asientos/", ManualEntryView.as_view(), name="manual-entry"),
    path("contabilidad/periodos/", PeriodsView.as_view(), name="periods"),
    path("", include(router.urls)),
]
