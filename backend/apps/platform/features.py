"""What each plan includes (decision 124).

Three tiers that build on each other: *esencial* (the office), *profesional*
(the street) and *empresa* (the whole financial company). A feature is a
module of the app; the API refuses its endpoints with 403 ``plan_feature``
when the company's plan does not include it, and the SPA hides its menu
entries and shows what the next plan adds. Users, branches and active
loans are capped apart (``limits.py``, decision 104).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

from django.http import HttpRequest, HttpResponse, JsonResponse

ESENCIAL = "esencial"
PROFESIONAL = "profesional"
EMPRESA = "empresa"
TIERS = (ESENCIAL, PROFESIONAL, EMPRESA)
TIER_LABELS = {ESENCIAL: "Esencial", PROFESIONAL: "Profesional", EMPRESA: "Empresa"}


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    tier: str
    #: API path prefixes (after /api/v1/) the feature owns.
    paths: tuple[str, ...]


FEATURES: tuple[Feature, ...] = (
    # --- Profesional: the street ---------------------------------------------
    Feature(
        "routes",
        "Rutas de cobro y app del cobrador",
        PROFESIONAL,
        ("ruta/", "rutas/", "rendiciones/"),
    ),
    Feature(
        "collections",
        "Cobranza: promesas, agenda y escalamiento",
        PROFESIONAL,
        ("agenda/", "promesas/", "seguimientos/", "gestores/", "reglas-escalamiento/"),
    ),
    Feature("messaging", "Recordatorios por WhatsApp, SMS y correo", PROFESIONAL, ("mensajes/",)),
    Feature("scores", "Clasificación de clientes", PROFESIONAL, ("clasificacion/",)),
    Feature("fraud", "Alertas antifraude", PROFESIONAL, ("alertas/",)),
    Feature("expenses", "Gastos e ingresos", PROFESIONAL, ("gastos/", "categorias-gasto/")),
    Feature("reports", "Centro de reportes y exportaciones", PROFESIONAL, ("exportaciones/",)),
    Feature("recovery", "Castigo y recuperación de cartera", PROFESIONAL, ("castigos/",)),
    # --- Empresa: the whole company -------------------------------------------
    Feature("accounting", "Contabilidad NIIF y cierre de mes", EMPRESA, ("contabilidad/",)),
    Feature("fiscal", "Comprobantes fiscales, 606 y 607", EMPRESA, ("comprobantes/",)),
    Feature("banking", "Conciliación bancaria", EMPRESA, ("conciliaciones/",)),
    Feature("payables", "Cuentas por pagar", EMPRESA, ("cuentas-por-pagar/",)),
    Feature("commissions", "Comisiones", EMPRESA, ("comisiones/",)),
    Feature("legal", "Vía legal", EMPRESA, ("casos-legales/", "profesionales-legales/")),
)

#: The reports every plan has; the rest of the catalog is «reports».
BASIC_REPORTS = ("reportes/cartera/", "reportes/cobros/")
#: Loan actions that belong to a feature (prefix «prestamos/<number>/»).
LOAN_ACTIONS = {"castigar/": "recovery", "gestiones/": "collections", "cobranza/": "collections"}
BY_KEY = {feature.key: feature for feature in FEATURES}


def features_of_tier(tier: str) -> set[str]:
    """Everything a tier includes: its own features and the lower tiers'."""
    rank = TIERS.index(tier) if tier in TIERS else len(TIERS) - 1
    return {f.key for f in FEATURES if TIERS.index(f.tier) <= rank}


def tier_of(company_id: UUID | str | None) -> str:
    """The company's tier; a company without a subscription gets everything."""
    from apps.platform.models import Subscription

    if company_id is None:
        return EMPRESA
    tier = (
        Subscription.objects.filter(company_id=company_id)
        .values_list("plan__tier", flat=True)
        .first()
    )
    return tier or EMPRESA


def features_of(company_id: UUID | str | None) -> set[str]:
    return features_of_tier(tier_of(company_id))


def feature_for_path(path: str) -> str | None:
    """The feature an API path belongs to, if any."""
    if not path.startswith("/api/v1/"):
        return None
    rest = path[len("/api/v1/") :]
    if rest.startswith("reportes/"):
        if rest in BASIC_REPORTS or rest == "reportes/":
            return None
        if rest.startswith("reportes/resultados/"):
            return "accounting"
        return "reports"
    if rest.startswith("prestamos/"):
        parts = rest.split("/", 2)
        if len(parts) == 3:
            for suffix, key in LOAN_ACTIONS.items():
                if parts[2].startswith(suffix):
                    return key
        return None
    for feature in FEATURES:
        if rest.startswith(feature.paths):
            return feature.key
    return None


def refusal(feature_key: str, tier: str) -> JsonResponse:
    feature = BY_KEY[feature_key]
    return JsonResponse(
        {
            "detail": (
                f"Tu plan {TIER_LABELS.get(tier, tier)} no incluye {feature.label.lower()}. "
                f"Cámbialo al plan {TIER_LABELS[feature.tier]} en Ajustes · Suscripción."
            ),
            "code": "plan_feature",
            "feature": feature.key,
            "tier": feature.tier,
        },
        status=403,
    )


class PlanFeatureMiddleware:
    """Refuses the endpoints of a feature the company's plan lacks. Runs
    after the tenant is set; the platform owner outside a company passes."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        user = request.user
        company_id = getattr(user, "company_id", None) if user.is_authenticated else None
        if company_id is not None:
            key = feature_for_path(request.path)
            if key is not None:
                tier = tier_of(company_id)
                if key not in features_of_tier(tier):
                    return refusal(key, tier)
        return self.get_response(request)
