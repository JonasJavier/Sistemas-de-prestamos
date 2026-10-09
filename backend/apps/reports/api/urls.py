from django.urls import path

from apps.reports.api.views import DashboardView, PortfolioReportView

urlpatterns = [
    path("tablero/", DashboardView.as_view(), name="dashboard"),
    path("reportes/cartera/", PortfolioReportView.as_view(), name="report-portfolio"),
]
