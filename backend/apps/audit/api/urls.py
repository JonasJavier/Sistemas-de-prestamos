from django.urls import path

from apps.audit.api.views import AlertsView, ReviewView, RuleDetailView, RulesView

urlpatterns = [
    path("alertas/", AlertsView.as_view(), name="fraud-alerts"),
    path("alertas/reglas/", RulesView.as_view(), name="fraud-rules"),
    path("alertas/reglas/<uuid:pk>/", RuleDetailView.as_view(), name="fraud-rule"),
    path("alertas/<uuid:pk>/revisar/", ReviewView.as_view(), name="fraud-review"),
]
