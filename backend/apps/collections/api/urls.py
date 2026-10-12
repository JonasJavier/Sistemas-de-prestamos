from django.urls import path

from apps.collections.api.views import (
    AssignView,
    ConsentView,
    CustomerLocationView,
    MyRouteView,
    OpenRouteView,
    PingView,
    ReorderView,
    RouteMapView,
    RouteStopsView,
    RoutesView,
    VisitView,
)
from apps.collections.api.views_agenda import (
    AgendaView,
    AgentsView,
    AssignAgentView,
    CancelPromiseView,
    CustomerTimelineView,
    EscalationRulesView,
    FollowUpView,
    LoanTimelineView,
    TaskActionView,
)
from apps.collections.api.views_legal import (
    CaseDetailView,
    CaseDocumentView,
    CasesView,
    CloseCaseView,
    CostsView,
    ProfessionalDetailView,
    ProfessionalsView,
)

urlpatterns = [
    # Phase 8 · F9 (decision 095).
    path("profesionales-legales/", ProfessionalsView.as_view(), name="legal-professionals"),
    path(
        "profesionales-legales/<uuid:pk>/",
        ProfessionalDetailView.as_view(),
        name="legal-professional",
    ),
    path("casos-legales/", CasesView.as_view(), name="legal-cases"),
    path("casos-legales/<uuid:pk>/", CaseDetailView.as_view(), name="legal-case"),
    path("casos-legales/<uuid:pk>/cerrar/", CloseCaseView.as_view(), name="legal-case-close"),
    path("casos-legales/<uuid:pk>/costas/", CostsView.as_view(), name="legal-case-costs"),
    path(
        "casos-legales/<uuid:pk>/documentos/<slug:kind>/",
        CaseDocumentView.as_view(),
        name="legal-case-document",
    ),
    path("ruta/", MyRouteView.as_view(), name="my-route"),
    path("ruta/consentimiento/", ConsentView.as_view(), name="route-consent"),
    path("ruta/abrir/", OpenRouteView.as_view(), name="route-open"),
    path("ruta/orden/", ReorderView.as_view(), name="route-order"),
    path("ruta/ubicacion/", PingView.as_view(), name="route-ping"),
    path("rutas/", RoutesView.as_view(), name="routes"),
    path("rutas/asignar/", AssignView.as_view(), name="routes-assign"),
    path("rutas/<uuid:collector_id>/mapa/", RouteMapView.as_view(), name="routes-map"),
    path("rutas/<uuid:collector_id>/paradas/", RouteStopsView.as_view(), name="routes-stops"),
    path("prestamos/<str:number>/gestiones/", VisitView.as_view(), name="loan-visits"),
    path("prestamos/<str:number>/cobranza/", LoanTimelineView.as_view(), name="loan-collections"),
    path(
        "clientes/<uuid:pk>/cobranza/", CustomerTimelineView.as_view(), name="customer-collections"
    ),
    path("agenda/", AgendaView.as_view(), name="agenda"),
    path("promesas/<uuid:pk>/cancelar/", CancelPromiseView.as_view(), name="promise-cancel"),
    path("seguimientos/", FollowUpView.as_view(), name="follow-up"),
    path("seguimientos/<uuid:pk>/hecho/", TaskActionView.as_view(verb="hecho"), name="task-done"),
    path(
        "seguimientos/<uuid:pk>/reprogramar/",
        TaskActionView.as_view(verb="reprogramar"),
        name="task-reschedule",
    ),
    path("gestores/", AgentsView.as_view(), name="agents"),
    path("gestores/asignar/", AssignAgentView.as_view(), name="agents-assign"),
    path("reglas-escalamiento/", EscalationRulesView.as_view(), name="escalation-rules"),
    path(
        "prestamos/<str:number>/ubicacion-cliente/",
        CustomerLocationView.as_view(),
        name="loan-customer-location",
    ),
]
