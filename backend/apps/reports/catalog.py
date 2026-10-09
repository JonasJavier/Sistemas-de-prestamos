"""P64 «Centro de reportes» (decision 087): the catalog of reports.

Each report builds one ``Table`` (summary, columns, rows and totals) from
the indicator service or the same queries; the screen, the PDF and the
Excel render that very Table, so they never disagree (doc 09 §3). The
filters are the same everywhere and print in one line.

Doc 06: operational reports for G, Su, Ct and Au (the officer, his
branches' arrears); financial ones for G, Ct and Au; exports for G, Su,
Ct and Au, and only G and Au export personal data (the others get the
same report without the personal columns).
"""

import datetime as dt
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from decimal import Decimal
from uuid import UUID

from django.db.models import Count, DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.http import Http404
from django.utils import timezone

from apps.accounts import authz
from apps.reports import indicators

G, SU, OF, CT, AU = (
    authz.GERENTE,
    authz.SUPERVISOR,
    authz.OFICIAL,
    authz.CONTABILIDAD,
    authz.AUDITORIA,
)
EXPORTERS = frozenset({G, SU, CT, AU})
PERSONAL_EXPORTERS = frozenset({G, AU})
ZERO = Decimal("0.00")
MONEY = DecimalField(max_digits=14, decimal_places=2)


class ReportError(Exception):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


# --- The common shape -------------------------------------------------------------------------


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    kind: str = "text"  # text · money · int · date · pct
    total: bool = False
    personal: bool = False


@dataclass
class Table:
    title: str
    filters_line: str
    columns: list[Column]
    rows: list[dict]
    summary: list[dict] = field(default_factory=list)  # label, value, kind, hint
    note: str = ""
    landscape: bool = False

    @property
    def totals(self) -> dict:
        totals: dict = {}
        for column in self.columns:
            if column.total:
                values = [row.get(column.key) or 0 for row in self.rows]
                totals[column.key] = sum(
                    (Decimal(value) for value in values),
                    ZERO if column.kind == "money" else Decimal(0),
                )
        return totals

    @property
    def has_personal(self) -> bool:
        return any(column.personal for column in self.columns)

    def without_personal(self) -> Table:
        kept = [column for column in self.columns if not column.personal]
        keys = {column.key for column in kept}
        return replace(
            self,
            columns=kept,
            rows=[{k: v for k, v in row.items() if k in keys} for row in self.rows],
            note=(self.note + " " if self.note else "")
            + "Sin datos personales: tu rol no los exporta (doc 06).",
        )


@dataclass(frozen=True)
class Filter:
    key: str
    label: str
    # date · from · to · month · branch · collector · product · method · cut · bucket · grade
    kind: str


@dataclass(frozen=True)
class Report:
    key: str
    title: str
    description: str
    readers: frozenset[str]
    filters: tuple[Filter, ...]
    build: Callable[[Params], Table]
    group: str = "Operación"


# --- Filters ----------------------------------------------------------------------------------


@dataclass
class Params:
    user: object
    raw: dict
    branches: frozenset[UUID] | None
    picked: UUID | None
    parts: list[str] = field(default_factory=list)  # the printed filters line

    def text(self, key: str) -> str:
        return str(self.raw.get(key) or "").strip()

    def date(self, key: str, default: dt.date) -> dt.date:
        raw = self.text(key)
        if not raw:
            return default
        try:
            return dt.date.fromisoformat(raw)
        except ValueError as exc:
            raise ReportError(key, "Fecha inválida (AAAA-MM-DD).") from exc

    def uuid(self, key: str) -> UUID | None:
        raw = self.text(key)
        if not raw:
            return None
        try:
            return UUID(raw)
        except ValueError as exc:
            raise ReportError(key, "Valor inválido.") from exc

    def cut_date(self) -> dt.date:
        today = timezone.localdate()
        as_of = self.date("fecha", today)
        if as_of > today:
            raise ReportError("fecha", "La fecha de corte no puede ser futura.")
        self.parts.append(f"Corte al {as_of:%d/%m/%Y}")
        return as_of

    def period(self) -> tuple[dt.date, dt.date]:
        today = timezone.localdate()
        date_from = self.date("desde", today.replace(day=1))
        date_to = self.date("hasta", today)
        if date_from > date_to:
            raise ReportError("desde", "La fecha inicial va antes de la final.")
        if (date_to - date_from).days > 366:
            raise ReportError("desde", "El período no puede pasar de un año.")
        self.parts.append(f"Del {date_from:%d/%m/%Y} al {date_to:%d/%m/%Y}")
        return date_from, date_to

    def month(self) -> tuple[int, int]:
        today = timezone.localdate()
        raw = self.text("mes") or f"{today:%Y-%m}"
        try:
            year, month = (int(part) for part in raw.split("-"))
            dt.date(year, month, 1)
        except ValueError as exc:
            raise ReportError("mes", "Mes inválido (AAAA-MM).") from exc
        self.parts.append(f"Mes: {month:02d}/{year}")
        return year, month

    def scope(self) -> None:
        self.parts.append(f"Sucursal: {scope_label(self.branches)}")

    def named(self, key: str, label: str, model) -> UUID | None:
        value = self.uuid(key)
        if value is None:
            return None
        obj = model.objects.filter(pk=value).first()
        if obj is None:
            raise ReportError(key, "No existe.")
        name = obj.get_full_name() if hasattr(obj, "get_full_name") else str(obj)
        self.parts.append(f"{label}: {name or obj}")
        return value

    @property
    def line(self) -> str:
        return " · ".join(self.parts)


def resolve_branches(user, picked: UUID | None) -> tuple[frozenset[UUID] | None, UUID | None]:
    """The branches a figure covers (the user's scope) and the one picked."""
    from apps.core.models import Branch

    scope = authz.branch_scope(user)
    if picked is None:
        return scope, None
    if scope is not None and picked not in scope:
        raise Http404("Sucursal fuera de tu alcance.")
    if not Branch.objects.filter(pk=picked).exists():
        raise Http404("Sucursal no encontrada.")
    return frozenset({picked}), picked


def scope_label(branches: frozenset[UUID] | None) -> str:
    from apps.core.models import Branch

    if branches is None:
        return "Toda la empresa"
    names = sorted(Branch.objects.filter(id__in=branches).values_list("name", flat=True))
    return ", ".join(names) or "Sin sucursal"


def _person(user) -> str:
    return (user.get_full_name() or user.email) if user else ""


# --- Reports ----------------------------------------------------------------------------------


def _portfolio(p: Params) -> Table:
    from apps.lending.models import LoanProduct

    as_of = p.cut_date()
    by = p.text("corte") or "sucursal"
    if by not in indicators.CUTS:
        raise ReportError("corte", "Usa sucursal, cobrador o producto.")
    p.scope()
    product = p.named("producto", "Producto", LoanProduct)
    rows = indicators.portfolio_rows(as_of, branches=p.branches, product_id=product)
    totals = indicators.portfolio_of(rows)
    label = {"sucursal": "Sucursal", "cobrador": "Cobrador", "producto": "Producto"}[by]
    p.parts.append(f"Por {label.lower()}")
    summary = [
        {"label": "Cartera activa", "value": totals.principal, "kind": "money"},
        {"label": "Préstamos", "value": totals.count, "kind": "int"},
        {"label": "PAR7", "value": totals.par7, "kind": "pct"},
        {"label": "PAR30", "value": totals.par30, "kind": "pct"},
        {"label": "PAR90", "value": totals.par90, "kind": "pct"},
    ] + [
        {
            "label": bucket["label"],
            "value": bucket["principal"],
            "kind": "money",
            "hint": f"{bucket['count']} préstamo(s)",
        }
        for bucket in totals.buckets
    ]
    return Table(
        title="Cartera",
        filters_line=p.line,
        columns=[
            Column("name", label),
            Column("count", "Préstamos", "int", total=True),
            Column("in_arrears", "En atraso", "int", total=True),
            Column("principal", "Capital pendiente", "money", total=True),
            Column("at_risk30", "En riesgo (+30 días)", "money", total=True),
            Column("par30", "PAR30", "pct"),
        ],
        rows=[
            {k: v for k, v in row.items() if k != "key"}
            for row in indicators.portfolio_cuts(rows, by)
        ],
        summary=summary,
        note=indicators.DEFINITIONS["par30"]
        + " "
        + ("Fecha pasada: foto nocturna de ese día." if as_of < timezone.localdate() else ""),
    )


def _arrears(p: Params) -> Table:
    from apps.accounts.models import User
    from apps.collections.models import DelinquencySnapshot
    from apps.lending.models import Installment, Loan

    as_of = p.cut_date()
    p.scope()
    collector = p.named("cobrador", "Cobrador", User)
    bucket = p.text("tramo")
    if bucket and bucket not in indicators.BUCKET_LABELS:
        raise ReportError("tramo", "Tramo inválido.")
    if bucket:
        p.parts.append(f"Tramo: {indicators.BUCKET_LABELS[bucket]}")
    rows = []
    if as_of >= timezone.localdate():
        overdue = (
            Installment.objects.filter(loan=OuterRef("pk"), due_date__lt=as_of)
            .exclude(status__in=[Installment.Status.SUPERSEDED, Installment.Status.PAID])
            .values("loan")
            .annotate(
                total=Sum(
                    F("principal_due")
                    - F("principal_paid")
                    + F("interest_due")
                    - F("interest_paid")
                    - F("interest_waived")
                    + F("charges_due")
                    - F("charges_paid")
                )
            )
            .values("total")
        )
        loans = indicators.in_branches(
            Loan.objects.filter(status=Loan.Status.ACTIVE, days_past_due__gt=0),
            "branch_id",
            p.branches,
        )
        if collector:
            loans = loans.filter(collector_id=collector)
        loans = loans.annotate(
            overdue=Coalesce(Subquery(overdue, output_field=MONEY), Value(ZERO), output_field=MONEY)
        ).select_related("customer", "agent", "collector")
        for loan in loans.order_by("-days_past_due", "number"):
            rows.append(
                {
                    "loan": loan.number,
                    "customer": loan.customer.display_name,
                    "phone": loan.customer.phone,
                    "days": loan.days_past_due,
                    "bucket": indicators.BUCKET_LABELS[indicators.bucket_of(loan.days_past_due)],
                    "principal": loan.principal_outstanding,
                    "overdue": loan.overdue + loan.late_fee_outstanding,
                    "late_fee": loan.late_fee_outstanding,
                    "agent": _person(loan.agent or loan.collector),
                    "collector": _person(loan.collector),
                    "_key": indicators.bucket_of(loan.days_past_due),
                }
            )
    else:
        snaps = indicators.in_branches(
            DelinquencySnapshot.objects.filter(date=as_of, days_past_due__gt=0),
            "branch_id",
            p.branches,
        )
        if collector:
            snaps = snaps.filter(loan__collector_id=collector)
        snaps = snaps.select_related("loan__customer", "loan__agent", "loan__collector")
        for snap in snaps.order_by("-days_past_due", "loan__number"):
            loan = snap.loan
            rows.append(
                {
                    "loan": loan.number,
                    "customer": loan.customer.display_name,
                    "phone": loan.customer.phone,
                    "days": snap.days_past_due,
                    "bucket": indicators.BUCKET_LABELS[snap.bucket],
                    "principal": snap.principal_outstanding,
                    "overdue": snap.principal_overdue
                    + snap.interest_overdue
                    + snap.late_fee_outstanding,
                    "late_fee": snap.late_fee_outstanding,
                    "agent": _person(loan.agent or loan.collector),
                    "collector": _person(loan.collector),
                    "_key": snap.bucket,
                }
            )
    if bucket:
        rows = [row for row in rows if row["_key"] == bucket]
    for row in rows:
        row.pop("_key")
    return Table(
        title="Atrasos",
        filters_line=p.line,
        columns=[
            Column("loan", "Préstamo"),
            Column("customer", "Cliente", personal=True),
            Column("phone", "Teléfono", personal=True),
            Column("bucket", "Tramo"),
            Column("days", "Días", "int"),
            Column("principal", "Capital pendiente", "money", total=True),
            Column("overdue", "Vencido con mora", "money", total=True),
            Column("late_fee", "Mora", "money", total=True),
            Column("agent", "Gestor"),
            Column("collector", "Cobrador"),
        ],
        rows=rows,
        summary=[
            {"label": "Préstamos en atraso", "value": len(rows), "kind": "int"},
            {
                "label": "Capital en atraso",
                "value": sum((r["principal"] for r in rows), ZERO),
                "kind": "money",
            },
            {
                "label": "Vencido con mora",
                "value": sum((r["overdue"] for r in rows), ZERO),
                "kind": "money",
            },
        ],
        landscape=True,
    )


def _payments(p: Params) -> Table:
    from apps.accounts.models import User
    from apps.payments.models import Payment, PaymentAllocation, PaymentReversal

    date_from, date_to = p.period()
    p.scope()
    collector = p.named("cobrador", "Cobró", User)
    method = p.text("medio")
    if method and method not in Payment.Method.values:
        raise ReportError("medio", "Medio inválido.")
    if method:
        p.parts.append(f"Medio: {Payment.Method(method).label}")

    def scoped(qs, prefix=""):
        qs = indicators.in_branches(qs, f"{prefix}branch_id", p.branches)
        if collector:
            qs = qs.filter(**{f"{prefix}collected_by_id": collector})
        if method:
            qs = qs.filter(**{f"{prefix}method": method})
        return qs

    payments = scoped(
        Payment.objects.filter(value_date__gte=date_from, value_date__lte=date_to).exclude(
            kind=Payment.Kind.MIGRATED
        )
    ).select_related("loan", "customer", "collected_by")
    reversals = scoped(
        PaymentReversal.objects.filter(
            reversed_on__gte=date_from, reversed_on__lte=date_to
        ).exclude(payment__kind=Payment.Kind.MIGRATED),
        "payment__",
    ).select_related("payment__loan", "payment__customer", "payment__collected_by")
    ids = {pay.id for pay in payments} | {rev.payment_id for rev in reversals}
    parts: dict = defaultdict(lambda: defaultdict(lambda: ZERO))
    for row in (
        PaymentAllocation.objects.filter(payment_id__in=ids)
        .values("payment_id", "component")
        .annotate(t=Sum("amount"))
    ):
        parts[row["payment_id"]][row["component"]] = row["t"]
    methods = dict(Payment.Method.choices)

    def line(payment, day, sign, label):
        own = parts[payment.id]

        def signed(value: Decimal) -> Decimal:
            return value if sign > 0 or not value else -value  # never a «-0.00»

        return {
            "date": day,
            "number": payment.number,
            "loan": payment.loan.number,
            "customer": payment.customer.display_name,
            "method": methods[payment.method],
            "collected_by": _person(payment.collected_by),
            "principal": signed(own["principal"]),
            "interest": signed(own["interest"]),
            "late_fee": signed(own["late_fee"]),
            "charges": signed(own["charges"]),
            "amount": signed(payment.amount),
            "status": label,
        }

    rows = [
        line(pay, pay.value_date, 1, "Reversado" if pay.status == Payment.Status.REVERSED else "")
        for pay in payments
    ] + [line(rev.payment, rev.reversed_on, -1, "Reverso") for rev in reversals]
    rows.sort(key=lambda r: (r["date"], r["number"], r["status"] == "Reverso"))
    by_method: dict = defaultdict(lambda: ZERO)
    for row in rows:
        by_method[row["method"]] += row["amount"]
    return Table(
        title="Cobros",
        filters_line=p.line,
        columns=[
            Column("date", "Fecha", "date"),
            Column("number", "Recibo"),
            Column("loan", "Préstamo"),
            Column("customer", "Cliente", personal=True),
            Column("method", "Medio"),
            Column("collected_by", "Cobró"),
            Column("principal", "Capital", "money", total=True),
            Column("interest", "Interés", "money", total=True),
            Column("late_fee", "Mora", "money", total=True),
            Column("charges", "Cargos", "money", total=True),
            Column("amount", "Total", "money", total=True),
            Column("status", "Estado"),
        ],
        rows=rows,
        summary=[
            {
                "label": "Cobrado neto",
                "value": sum((r["amount"] for r in rows), ZERO),
                "kind": "money",
            },
            *(
                {"label": name, "value": total, "kind": "money"}
                for name, total in by_method.items()
            ),
        ],
        note=indicators.DEFINITIONS["collected"]
        + " Un reverso aparece en la fecha en que se hizo, con signo negativo.",
        landscape=True,
    )


def _disbursements(p: Params) -> Table:
    from apps.lending.models import Disbursement, LoanProduct

    date_from, date_to = p.period()
    p.scope()
    product = p.named("producto", "Producto", LoanProduct)
    rows_qs = indicators.in_branches(
        Disbursement.objects.filter(
            disbursed_on__gte=date_from, disbursed_on__lte=date_to, reversal_entry__isnull=True
        ),
        "loan__branch_id",
        p.branches,
    )
    if product:
        rows_qs = rows_qs.filter(loan__product_id=product)
    methods = dict(Disbursement.Method.choices)
    rows = [
        {
            "date": d.disbursed_on,
            "loan": d.loan.number,
            "customer": d.loan.customer.display_name,
            "product": d.loan.product.name,
            "method": methods[d.method],
            "gross": d.gross,
            "discounted": d.discounted_charges,
            "financed": d.financed_charges,
            "cash_charges": d.cash_charges,
            "net": d.net,
        }
        for d in rows_qs.select_related("loan__customer", "loan__product").order_by(
            "disbursed_on", "loan__number"
        )
    ]
    return Table(
        title="Desembolsos",
        filters_line=p.line,
        columns=[
            Column("date", "Fecha", "date"),
            Column("loan", "Préstamo"),
            Column("customer", "Cliente", personal=True),
            Column("product", "Producto"),
            Column("method", "Medio"),
            Column("gross", "Bruto", "money", total=True),
            Column("discounted", "Cargos descontados", "money", total=True),
            Column("financed", "Cargos financiados", "money", total=True),
            Column("cash_charges", "Cargos en efectivo", "money", total=True),
            Column("net", "Neto entregado", "money", total=True),
        ],
        rows=rows,
        summary=[
            {"label": "Desembolsos", "value": len(rows), "kind": "int"},
            {
                "label": "Monto bruto",
                "value": sum((r["gross"] for r in rows), ZERO),
                "kind": "money",
            },
            {
                "label": "Neto entregado",
                "value": sum((r["net"] for r in rows), ZERO),
                "kind": "money",
            },
        ],
        note=indicators.DEFINITIONS["disbursed"],
        landscape=True,
    )


def _cash(p: Params) -> Table:
    from apps.cash.models import CashSession
    from apps.lending.models import Disbursement
    from apps.payments.models import Payment

    date_from, date_to = p.period()
    p.scope()
    sessions = indicators.in_branches(
        CashSession.objects.filter(business_date__gte=date_from, business_date__lte=date_to),
        "branch_id",
        p.branches,
    ).select_related("cashier")
    ids = [s.id for s in sessions]
    collected = dict(
        Payment.objects.filter(cash_session_id__in=ids, status=Payment.Status.POSTED)
        .values_list("cash_session_id")
        .annotate(t=Sum("amount"))
    )
    paid_out = dict(
        Disbursement.objects.filter(cash_session_id__in=ids, reversal_entry__isnull=True)
        .values_list("cash_session_id")
        .annotate(t=Sum("net"))
    )
    by_method = (
        Payment.objects.filter(cash_session_id__in=ids, status=Payment.Status.POSTED)
        .values("method")
        .annotate(t=Sum("amount"), n=Count("id"))
        .order_by("method")
    )
    statuses = dict(CashSession.Status.choices)
    rows = [
        {
            "number": s.number,
            "date": s.business_date,
            "cashier": _person(s.cashier),
            "status": statuses[s.status],
            "opening": s.carried_over + s.funded_amount,
            "collected": collected.get(s.id, ZERO),
            "disbursed": paid_out.get(s.id, ZERO),
            "expected": s.expected,
            "counted": s.counted,
            "difference": s.difference or ZERO,
        }
        for s in sessions.order_by("business_date", "number")
    ]
    methods = dict(Payment.Method.choices)
    diffs = indicators.cash_differences(date_from, date_to, branches=p.branches)
    return Table(
        title="Caja",
        filters_line=p.line,
        columns=[
            Column("number", "Sesión"),
            Column("date", "Fecha", "date"),
            Column("cashier", "Cajero"),
            Column("status", "Estado"),
            Column("opening", "Fondo inicial", "money"),  # carried over: never added up
            Column("collected", "Cobros", "money", total=True),
            Column("disbursed", "Desembolsos", "money", total=True),
            Column("expected", "Esperado", "money"),
            Column("counted", "Contado", "money"),
            Column("difference", "Diferencia", "money", total=True),
        ],
        rows=rows,
        summary=[
            *(
                {
                    "label": f"Cobros en {methods[row['method']].lower()}",
                    "value": row["t"],
                    "kind": "money",
                    "hint": f"{row['n']} pago(s)",
                }
                for row in by_method
            ),
            {
                "label": "Diferencias del período",
                "value": diffs["total"],
                "kind": "money",
                "hint": f"Faltantes {diffs['shortage']:,.2f} · sobrantes {diffs['overage']:,.2f}",
            },
        ],
        note="Diferencias del período: " + indicators.DEFINITIONS["cash_differences"],
        landscape=True,
    )


def _activity(p: Params) -> Table:
    from apps.collections.models import CollectionAction, PaymentPromise

    date_from, date_to = p.period()
    p.scope()
    actions = indicators.in_branches(
        CollectionAction.objects.filter(
            created_at__date__gte=date_from, created_at__date__lte=date_to
        ),
        "loan__branch_id",
        p.branches,
    )
    Kind, Result = CollectionAction.Kind, CollectionAction.Result
    by_user = {
        row["user_id"]: row
        for row in actions.values("user_id").annotate(
            total=Count("id"),
            visits=Count("id", filter=Q(kind=Kind.VISIT)),
            calls=Count("id", filter=Q(kind=Kind.CALL)),
            messages=Count("id", filter=Q(kind=Kind.MESSAGE)),
            contacted=Count(
                "id", filter=Q(result__in=[Result.PAID, Result.PROMISED, Result.CONTACTED])
            ),
        )
    }
    promises = indicators.in_branches(
        PaymentPromise.objects.filter(promised_on__gte=date_from, promised_on__lte=date_to),
        "loan__branch_id",
        p.branches,
    )
    Status = PaymentPromise.Status
    for row in promises.values("created_by_id").annotate(
        made=Count("id"),
        kept=Count("id", filter=Q(status=Status.KEPT)),
        broken=Count("id", filter=Q(status=Status.BROKEN)),
    ):
        entry = by_user.setdefault(row["created_by_id"], {"user_id": row["created_by_id"]})
        entry.update(made=row["made"], kept=row["kept"], broken=row["broken"])
    from apps.accounts.models import User

    names = {u.id: _person(u) for u in User.objects.filter(id__in=[k for k in by_user if k])}
    rows = []
    for user_id, data in by_user.items():
        kept, broken = data.get("kept", 0), data.get("broken", 0)
        rows.append(
            {
                "user": names.get(user_id, "—"),
                "total": data.get("total", 0),
                "visits": data.get("visits", 0),
                "calls": data.get("calls", 0),
                "messages": data.get("messages", 0),
                "contacted": data.get("contacted", 0),
                "made": data.get("made", 0),
                "kept": kept,
                "broken": broken,
                "rate": indicators.ratio(Decimal(kept), Decimal(kept + broken)),
            }
        )
    rows.sort(key=lambda r: (-r["total"], r["user"]))
    overall = indicators.promise_compliance(date_from, date_to, branches=p.branches)
    return Table(
        title="Gestiones y promesas",
        filters_line=p.line,
        columns=[
            Column("user", "Gestor"),
            Column("total", "Gestiones", "int", total=True),
            Column("visits", "Visitas", "int", total=True),
            Column("calls", "Llamadas", "int", total=True),
            Column("messages", "Mensajes", "int", total=True),
            Column("contacted", "Con contacto", "int", total=True),
            Column("made", "Promesas del período", "int", total=True),
            Column("kept", "Cumplidas", "int", total=True),
            Column("broken", "Incumplidas", "int", total=True),
            Column("rate", "Cumplimiento", "pct"),
        ],
        rows=rows,
        summary=[
            {"label": "Gestiones", "value": sum(r["total"] for r in rows), "kind": "int"},
            {
                "label": "Cumplimiento de promesas",
                "value": overall["rate"],
                "kind": "pct",
                "hint": f"{overall['kept']} cumplidas · {overall['broken']} incumplidas",
            },
        ],
        note="Promesas: " + indicators.DEFINITIONS["promises"],
        landscape=True,
    )


def _results(p: Params) -> Table:
    from apps.ledger.accounting import management_results

    date_from, date_to = p.period()
    if p.branches is not None and p.picked is None:
        raise ReportError("sucursal", "Elige una sucursal o toda la empresa.")
    p.scope()
    results = management_results(date_from, date_to, branch_id=p.picked)
    rows = [
        {"group": "Ingresos cobrados", "concept": label, "amount": amount}
        for label, amount in results.income
    ]
    rows += [
        {
            "group": "Gastos operativos",
            "concept": f"{account.code} {account.name}",
            "amount": -amount,
        }
        for account, amount in results.expenses
    ]
    rows += [
        {"group": "Aparte", "concept": "Castigos de cartera", "amount": results.write_offs},
        {"group": "Aparte", "concept": "Retiros del dueño", "amount": results.owner_withdrawals},
        {"group": "Aparte", "concept": "Aportes de capital netos", "amount": results.owner_capital},
    ]
    return Table(
        title="Resultados (gasto-ingreso)",
        filters_line=p.line,
        columns=[
            Column("group", "Grupo"),
            Column("concept", "Concepto"),
            Column("amount", "Monto", "money"),
        ],
        rows=rows,
        summary=[
            {"label": "Ingresos cobrados", "value": results.income_total, "kind": "money"},
            {"label": "Gastos operativos", "value": results.expense_total, "kind": "money"},
            {"label": "Ganancia cobrada", "value": results.result, "kind": "money"},
        ],
        note=indicators.DEFINITIONS["profit"],
    )


def _scores(p: Params) -> Table:
    from apps.reports import scoring
    from apps.reports.api.views_scores import scores_for

    p.scope()
    grade = p.text("grado")
    if grade and grade != "sin" and grade not in scoring.GRADE_LABELS:
        raise ReportError("grado", "Grado inválido.")
    if grade:
        p.parts.append(f"Grado: {scoring.GRADE_LABELS.get(grade, 'Sin historial')}")
    rows_qs, counts = scores_for(p.user, branch=p.picked, grade=grade)
    rows = []
    for score in rows_qs.select_related("customer__home_branch").order_by(
        "grade", "-score", "customer__first_name"
    ):
        points = {f["key"]: f.get("points") for f in score.factors}
        rows.append(
            {
                "customer": score.customer.display_name,
                "branch": score.customer.home_branch.name,
                "grade": score.grade or "—",
                "label": scoring.GRADE_LABELS.get(score.grade, "Sin historial"),
                "score": score.score,
                "punctuality": points.get("punctuality"),
                "days_late": points.get("days_late"),
                "seniority": points.get("seniority"),
                "paid_off": points.get("paid_off"),
                "cap": " ".join(f["label"] for f in score.factors if f["key"] in {"cap", "short"}),
            }
        )
    return Table(
        title="Clasificación de clientes",
        filters_line=p.line,
        columns=[
            Column("customer", "Cliente", personal=True),
            Column("branch", "Sucursal"),
            Column("grade", "Grado"),
            Column("label", "Clasificación"),
            Column("score", "Puntos", "text"),
            Column("punctuality", "A tiempo (50)", "text"),
            Column("days_late", "Atraso promedio (30)", "text"),
            Column("seniority", "Antigüedad (10)", "text"),
            Column("paid_off", "Saldados (10)", "text"),
            Column("cap", "Tope"),
        ],
        rows=rows,
        summary=[
            {"label": f"{g} · {label}", "value": counts[g], "kind": "int"}
            for g, _, label in scoring.GRADES
        ]
        + [{"label": "Sin historial", "value": counts["none"], "kind": "int"}],
        note="A ≥ 85 · B ≥ 70 · C ≥ 50 · D por debajo, sobre 100 puntos. Con menos de 4 cuotas "
        "vencidas queda entre B y C. Un préstamo castigado o un atraso actual de más de 90 días "
        "deja al cliente en D; más de 30 días, como mucho en C.",
        landscape=True,
    )


def _commissions(p: Params) -> Table:
    from apps.reports.models import CommissionRun

    year, month = p.month()
    run = CommissionRun.objects.filter(year=year, month=month).first()
    lines = (
        run.lines.select_related("user", "rule").order_by("-amount", "user__first_name")
        if run
        else []
    )
    rows = [
        {
            "user": _person(line.user),
            "role": line.rule.role,
            "rule": line.rule.name,
            "base_label": line.rule.get_base_display(),
            "base": line.base_amount,
            "rate": line.rate,
            "goal": line.goal,
            "amount": line.amount,
        }
        for line in lines
    ]
    status = run.get_status_display() if run else "Sin calcular"
    return Table(
        title="Comisiones",
        filters_line=p.line + f" · {status}",
        columns=[
            Column("user", "Empleado"),
            Column("role", "Rol"),
            Column("rule", "Regla"),
            Column("base_label", "Base"),
            Column("base", "Monto base", "money", total=True),
            Column("rate", "Porcentaje", "pct"),
            Column("goal", "Meta", "money"),
            Column("amount", "Comisión", "money", total=True),
        ],
        rows=rows,
        summary=[
            {"label": "Total de comisiones", "value": run.total if run else ZERO, "kind": "money"},
            {"label": "Estado", "value": status, "kind": "text"},
        ],
        note="Con meta, la comisión se gana sobre toda la base solo si la base llega a la meta. "
        "Un reverso resta en el mes en que se hace; un desembolso anulado no cuenta.",
        landscape=True,
    )


OPERATIONAL = frozenset({G, SU, CT, AU})
FINANCIAL = frozenset({G, CT, AU})
PERIOD = (Filter("desde", "Desde", "from"), Filter("hasta", "Hasta", "to"))
BRANCH = Filter("sucursal", "Sucursal", "branch")

REPORTS: dict[str, Report] = {
    report.key: report
    for report in [
        Report(
            "cartera",
            "Cartera",
            "Saldos por sucursal, cobrador o producto; antigüedad y PAR.",
            OPERATIONAL,
            (
                Filter("fecha", "Fecha de corte", "date"),
                Filter("corte", "Agrupar por", "cut"),
                BRANCH,
                Filter("producto", "Producto", "product"),
            ),
            _portfolio,
        ),
        Report(
            "atrasos",
            "Atrasos",
            "Préstamos atrasados por tramo, con días, vencido, gestor y cobrador.",
            OPERATIONAL | {OF},
            (
                Filter("fecha", "Fecha de corte", "date"),
                BRANCH,
                Filter("cobrador", "Cobrador", "collector"),
                Filter("tramo", "Tramo", "bucket"),
            ),
            _arrears,
        ),
        Report(
            "cobros",
            "Cobros",
            "Pagos del período con su desglose por capital, interés, mora y cargos.",
            OPERATIONAL,
            (
                *PERIOD,
                BRANCH,
                Filter("cobrador", "Cobró", "collector"),
                Filter("medio", "Medio", "method"),
            ),
            _payments,
        ),
        Report(
            "desembolsos",
            "Desembolsos",
            "Desembolsos del período: bruto, cargos y neto entregado.",
            OPERATIONAL,
            (*PERIOD, BRANCH, Filter("producto", "Producto", "product")),
            _disbursements,
        ),
        Report(
            "caja",
            "Caja",
            "Sesiones de caja del período: fondo, cobros, desembolsos y diferencias.",
            OPERATIONAL,
            (*PERIOD, BRANCH),
            _cash,
        ),
        Report(
            "gestiones",
            "Gestiones y promesas",
            "Actividad de cobranza por gestor y cumplimiento de promesas.",
            OPERATIONAL,
            (*PERIOD, BRANCH),
            _activity,
        ),
        Report(
            "resultados",
            "Resultados (gasto-ingreso)",
            "Lo cobrado menos los gastos operativos; lo del dueño aparte.",
            FINANCIAL,
            (*PERIOD, BRANCH),
            _results,
            group="Finanzas",
        ),
        Report(
            "comisiones",
            "Comisiones",
            "Cálculo del mes por empleado, con su regla.",
            frozenset({G, CT, AU}),
            (Filter("mes", "Mes", "month"),),
            _commissions,
            group="Finanzas",
        ),
        Report(
            "clasificacion",
            "Clasificación de clientes",
            "Grado A–D de cada cliente con sus puntos y el porqué.",
            frozenset({G, SU, OF, AU}),
            (BRANCH, Filter("grado", "Grado", "grade")),
            _scores,
            group="Clientes",
        ),
    ]
}


def available(user) -> list[Report]:
    roles = authz.role_names(user)
    return [report for report in REPORTS.values() if roles & report.readers]


def get(user, key: str) -> Report:
    report = REPORTS.get(key)
    if report is None or not (authz.role_names(user) & report.readers):
        raise Http404("Reporte no encontrado.")
    return report


def build(user, key: str, raw: dict) -> Table:
    report = get(user, key)
    picked = Params(user=user, raw=raw, branches=None, picked=None).uuid("sucursal")
    branches, picked = resolve_branches(user, picked)
    return report.build(Params(user=user, raw=raw, branches=branches, picked=picked))


def can_export(user) -> bool:
    return bool(authz.role_names(user) & EXPORTERS)


def exports_personal(user) -> bool:
    return bool(authz.role_names(user) & PERSONAL_EXPORTERS)
