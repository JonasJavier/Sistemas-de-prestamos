from django.urls import path

from apps.reports.api.views import DashboardView, PortfolioReportView
from apps.reports.api.views_center import (
    CatalogView,
    ExportFileView,
    ExportView,
    MyExportsView,
    ReportView,
)
from apps.reports.api.views_scores import ScoresView

urlpatterns = [
    path("tablero/", DashboardView.as_view(), name="dashboard"),
    path("reportes/", CatalogView.as_view(), name="report-catalog"),
    path("reportes/cartera/", PortfolioReportView.as_view(), name="report-portfolio"),
    path("clasificacion/", ScoresView.as_view(), name="customer-scores"),
    path("reportes/<slug:key>/datos/", ReportView.as_view(), name="report-data"),
    path("reportes/<slug:key>/exportar/", ExportView.as_view(), name="report-export"),
    path("exportaciones/", MyExportsView.as_view(), name="exports"),
    path("exportaciones/<uuid:pk>/archivo/", ExportFileView.as_view(), name="export-file"),
]
