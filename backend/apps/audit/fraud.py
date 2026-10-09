"""Doc 06 §9 «Alertas antifraude» (decision 090): the nightly review.

Each rule counts one pattern per person over its window; reaching the
threshold opens an alert and tells the managers. The same pattern for the
same person does not alert again within the window, so a review is not
buried under repeats. Rules come with prudent defaults and the manager
tunes or turns them off (P79).
"""

import datetime as dt
from collections import Counter
from collections.abc import Callable

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import FraudAlert, FraudKind, FraudRule, LoginEvent
from apps.core.text import plural

DEFAULTS = {
    FraudKind.REVERSALS: (3, 7),
    FraudKind.WAIVERS: (5, 7),
    FraudKind.CASH_DIFFERENCES: (3, 30),
    FraudKind.OFF_HOURS: (3, 7),
    FraudKind.NEW_DEVICE: (1, 1),
    FraudKind.OFF_ROUTE: (5, 7),
    FraudKind.CASH_LIMIT: (2, 7),
    FraudKind.PERMISSIONS: (1, 1),
}
NOUNS = {  # (one, many)
    FraudKind.REVERSALS: ("reverso pedido", "reversos pedidos"),
    FraudKind.WAIVERS: (
        "condonación o descuento aprobado",
        "condonaciones o descuentos aprobados",
    ),
    FraudKind.CASH_DIFFERENCES: ("diferencia de caja", "diferencias de caja"),
    FraudKind.OFF_HOURS: (
        "inicio de sesión fuera de horario",
        "inicios de sesión fuera de horario",
    ),
    FraudKind.NEW_DEVICE: (
        "inicio de sesión desde un dispositivo nuevo",
        "inicios de sesión desde un dispositivo nuevo",
    ),
    FraudKind.OFF_ROUTE: ("cobro fuera de ruta", "cobros fuera de ruta"),
    FraudKind.CASH_LIMIT: (
        "ruta por encima del límite de efectivo",
        "rutas por encima del límite de efectivo",
    ),
    FraudKind.PERMISSIONS: (
        "cambio de roles, sucursales o límites",
        "cambios de roles, sucursales o límites",
    ),
}


class FraudError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def rules(company_id) -> list[FraudRule]:
    """Every kind, created with its default the first time it is asked for."""
    existing = {r.kind: r for r in FraudRule.objects.all()}
    missing = [
        FraudRule(company_id=company_id, kind=kind, threshold=t, window_days=w)
        for kind, (t, w) in DEFAULTS.items()
        if kind not in existing
    ]
    if missing:
        FraudRule.objects.bulk_create(missing, ignore_conflicts=True)
        existing = {r.kind: r for r in FraudRule.objects.all()}
    return [existing[kind] for kind in DEFAULTS]


def update_rule(*, user: User, rule: FraudRule, **fields) -> FraudRule:
    if not authz.has_any_role(user, authz.GERENTE):
        raise FraudError("Las reglas antifraude las ajusta el gerente.", "forbidden")
    for key in ("threshold", "window_days", "is_active"):
        if key in fields:
            setattr(rule, key, fields[key])
    if not 1 <= int(rule.threshold) <= 1000:
        raise FraudError("El umbral va de 1 a 1000.", "threshold")
    if not 1 <= int(rule.window_days) <= 90:
        raise FraudError("La ventana va de 1 a 90 días.", "window_days")
    rule.save()
    return rule


# --- What each rule counts, per person ---------------------------------------------------------


def _reversals(since: dt.datetime) -> Counter:
    from apps.payments.models import PaymentReversal

    return Counter(
        PaymentReversal.objects.filter(created_at__gte=since).values_list(
            "requested_by_id", flat=True
        )
    )


def _waivers(since: dt.datetime) -> Counter:
    from apps.core.models import ApprovalRequest

    return Counter(
        ApprovalRequest.objects.filter(
            kind__in=[ApprovalRequest.Kind.WAIVE_LATE_FEE, ApprovalRequest.Kind.PAYOFF_DISCOUNT],
            status__in=[ApprovalRequest.Status.APPROVED, ApprovalRequest.Status.USED],
            decided_at__gte=since,
        ).values_list("requested_by_id", flat=True)
    )


def _cash_differences(since: dt.datetime) -> Counter:
    from apps.cash.models import CashDifference

    return Counter(
        CashDifference.objects.filter(occurred_on__gte=since.date()).values_list(
            "person_id", flat=True
        )
    )


def _off_hours(since: dt.datetime) -> Counter:
    return Counter(
        LoginEvent.objects.filter(at__gte=since, outside_hours=True).values_list(
            "user_id", flat=True
        )
    )


def _new_device(since: dt.datetime) -> Counter:
    return Counter(
        LoginEvent.objects.filter(at__gte=since, new_device=True).values_list("user_id", flat=True)
    )


def _off_route(since: dt.datetime) -> Counter:
    from apps.payments.models import Payment

    return Counter(
        Payment.objects.filter(
            off_route=True, created_at__gte=since, status=Payment.Status.POSTED
        ).values_list("collected_by_id", flat=True)
    )


def _cash_limit(since: dt.datetime) -> Counter:
    from apps.cash.models import RouteSession

    return Counter(
        RouteSession.objects.filter(limit_alerted_at__gte=since).values_list(
            "collector_id", flat=True
        )
    )


def _permissions(since: dt.datetime) -> Counter:
    """Company-wide: memberships and approval limits created or changed."""
    from apps.accounts.models import ApprovalLimit, Membership

    changes = (
        Membership.pgh_event_model.objects.filter(pgh_created_at__gte=since).count()
        + ApprovalLimit.pgh_event_model.objects.filter(pgh_created_at__gte=since).count()
    )
    return Counter({None: changes}) if changes else Counter()


COUNTERS: dict[str, Callable[[dt.datetime], Counter]] = {
    FraudKind.REVERSALS: _reversals,
    FraudKind.WAIVERS: _waivers,
    FraudKind.CASH_DIFFERENCES: _cash_differences,
    FraudKind.OFF_HOURS: _off_hours,
    FraudKind.NEW_DEVICE: _new_device,
    FraudKind.OFF_ROUTE: _off_route,
    FraudKind.CASH_LIMIT: _cash_limit,
    FraudKind.PERMISSIONS: _permissions,
}


def review(company_id, now: dt.datetime | None = None) -> list[FraudAlert]:
    """Nightly: count every active rule's pattern and open the alerts due."""
    from apps.notifications.models import Notification
    from apps.notifications.services import managers, notify

    now = now or timezone.now()
    created = []
    with transaction.atomic():
        for rule in rules(company_id):
            if not rule.is_active:
                continue
            since = now - dt.timedelta(days=rule.window_days)
            counts = COUNTERS[rule.kind](since)
            recent = set(
                FraudAlert.objects.filter(kind=rule.kind, created_at__gte=since).values_list(
                    "subject_id", flat=True
                )
            )
            names = {
                u.id: u.get_full_name() or u.email
                for u in User.objects.filter(id__in=[k for k in counts if k])
            }
            for subject_id, count in counts.items():
                if count < rule.threshold or subject_id in recent:
                    continue
                who = names.get(subject_id, "La empresa") if subject_id else "La empresa"
                created.append(
                    FraudAlert.objects.create(
                        company_id=company_id,
                        kind=rule.kind,
                        subject_id=subject_id,
                        count=count,
                        threshold=rule.threshold,
                        window_days=rule.window_days,
                        detail=f"{who}: {plural(count, *NOUNS[rule.kind])} en "
                        f"{plural(rule.window_days, 'día')}.",
                    )
                )
    if created:
        notify(
            company_id=company_id,
            users=managers(),
            kind=Notification.Kind.FRAUD_ALERT,
            text=f"Revisión nocturna: "
            f"{plural(len(created), 'alerta antifraude nueva', 'alertas antifraude nuevas')}. "
            + " ".join(alert.detail for alert in created)[:200],
            link="/ajustes/alertas",
        )
    return created


def mark_reviewed(*, alert: FraudAlert, user: User, note: str) -> FraudAlert:
    if not authz.has_any_role(user, authz.GERENTE):
        raise FraudError("Las alertas las revisa el gerente.", "forbidden")
    if alert.subject_id == user.pk:
        raise FraudError("Una alerta sobre ti la revisa otro gerente.", "own")
    if not note.strip():
        raise FraudError("Escribe qué encontraste al revisarla.", "note")
    if alert.status != FraudAlert.Status.OPEN:
        raise FraudError("Esa alerta ya fue revisada.", "reviewed")
    alert.status = FraudAlert.Status.REVIEWED
    alert.reviewed_by = user
    alert.reviewed_at = timezone.now()
    alert.review_note = note.strip()
    alert.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note", "updated_at"])
    return alert


def open_count() -> int:
    return FraudAlert.objects.filter(status=FraudAlert.Status.OPEN).count()
