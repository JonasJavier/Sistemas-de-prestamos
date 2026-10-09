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
from apps.ledger.api.views_banking import (
    ReconciliationsView,
    ReconciliationView,
    StatementLineView,
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
    path("conciliaciones/", ReconciliationsView.as_view(), name="reconciliations"),
    path("conciliaciones/<uuid:pk>/", ReconciliationView.as_view(), name="reconciliation"),
    path(
        "conciliaciones/<uuid:pk>/extracto/",
        ReconciliationView.as_view(verb="extracto"),
        name="reconciliation-import",
    ),
    path(
        "conciliaciones/<uuid:pk>/emparejar/",
        ReconciliationView.as_view(verb="auto"),
        name="reconciliation-auto",
    ),
    path(
        "conciliaciones/<uuid:pk>/cerrar/",
        ReconciliationView.as_view(verb="cerrar"),
        name="reconciliation-close",
    ),
    *(
        path(
            f"conciliaciones/<uuid:pk>/lineas/<uuid:line_id>/{verb}/",
            StatementLineView.as_view(verb=verb),
            name=f"statement-line-{verb}",
        )
        for verb in ("emparejar", "desemparejar", "registrar")
    ),
    path("", include(router.urls)),
]
