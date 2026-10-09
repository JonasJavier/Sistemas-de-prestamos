"""Doc 09 §3: every indicator with its exact definition, computed **once**
here and used by the dashboard, the reports on screen, the PDF and the
Excel (decision 086, the coherence rule). Figures come from the loans and
their installments, the payments and the ledger; a past cut date reads the
nightly delinquency snapshot of that day.

``branches`` is the set of branches the figure covers: ``None`` means the
whole company (the API resolves it from the user's scope and filters).
"""

import datetime as dt
from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.payments.portfolio import BUCKETS as BUCKET_LIMITS
from apps.payments.portfolio import bucket_of

ZERO = Decimal("0.00")
Branches = Collection[UUID] | None

BUCKET_LABELS = {
    "al_dia": "Al día",
    "1_7": "1–7 días",
    "8_30": "8–30 días",
    "31_60": "31–60 días",
    "61_90": "61–90 días",
    "90_mas": "Más de 90",
}
BUCKET_KEYS = [name for _, name in BUCKET_LIMITS] + ["90_mas"]

DEFINITIONS = {
    "portfolio": "Suma del capital pendiente de los préstamos activos (sin castigados, saldados "
    "ni anulados) a la fecha de corte.",
    "par30": "Capital pendiente total de los préstamos con una cuota vencida hace más de 30 días, "
    "entre la cartera activa. PAR7 y PAR90 usan 7 y 90 días.",
    "buckets": "Conteo y capital pendiente de los préstamos según su cuota impaga más antigua.",
    "collected": "Suma de lo aplicado en los pagos del día; un reverso resta el día en que se "
    "hace. No cuenta los saldos migrados.",
    "expected": "Cuotas que vencen ese día más lo vencido de los préstamos con promesa para ese "
    "día, a valor exigible (con la mora) al empezar la jornada.",
    "recovery": "Cobrado del día entre esperado del día.",
    "disbursed": "Suma de los montos brutos desembolsados en el mes calendario (sin los anulados).",
    "profit": "Intereses, mora y cargos cobrados más otros ingresos, menos los gastos operativos "
    "del período. No incluye el devengo del cierre de mes.",
    "promises": "Promesas cumplidas entre promesas resueltas (cumplidas e incumplidas) con fecha "
    "prometida en el período.",
    "cash_differences": "Suma de los faltantes y sobrantes hallados al contar cajas y rendiciones "
    "en el período. La meta es cero.",
}


def _ratio(part: Decimal, whole: Decimal) -> Decimal | None:
    return (part / whole).quantize(Decimal("0.0001")) if whole else None


def in_branches(qs, path: str, branches: Branches):
    return qs if branches is None else qs.filter(**{f"{path}__in": branches})


# --- Portfolio --------------------------------------------------------------------------------


@dataclass(frozen=True)
class PortfolioRow:
    loan_id: UUID
    branch_id: UUID
    collector_id: UUID | None
    product_id: UUID
    principal: Decimal
    days_past_due: int


def portfolio_rows(
    as_of: dt.date,
    *,
    branches: Branches = None,
    collector_id: UUID | None = None,
    product_id: UUID | None = None,
) -> list[PortfolioRow]:
    """Active loans at the cut date: live for today, the snapshot before."""
    from apps.collections.models import DelinquencySnapshot
    from apps.lending.models import Loan

    if as_of >= timezone.localdate():
        loans = in_branches(Loan.objects.filter(status=Loan.Status.ACTIVE), "branch_id", branches)
        if collector_id:
            loans = loans.filter(collector_id=collector_id)
        if product_id:
            loans = loans.filter(product_id=product_id)
        fields = ("id", "branch_id", "collector_id", "product_id", "principal_outstanding")
        rows = loans.values_list(*fields, "days_past_due")
    else:
        snaps = in_branches(DelinquencySnapshot.objects.filter(date=as_of), "branch_id", branches)
        if collector_id:
            snaps = snaps.filter(loan__collector_id=collector_id)
        if product_id:
            snaps = snaps.filter(loan__product_id=product_id)
        rows = snaps.values_list(
            "loan_id",
            "branch_id",
            "loan__collector_id",
            "loan__product_id",
            "principal_outstanding",
            "days_past_due",
        )
    return [PortfolioRow(*row) for row in rows]


@dataclass
class Portfolio:
    count: int
    principal: Decimal
    buckets: list[dict] = field(default_factory=list)
    at_risk7: Decimal = ZERO
    at_risk30: Decimal = ZERO
    at_risk90: Decimal = ZERO

    @property
    def par7(self) -> Decimal | None:
        return _ratio(self.at_risk7, self.principal)

    @property
    def par30(self) -> Decimal | None:
        return _ratio(self.at_risk30, self.principal)

    @property
    def par90(self) -> Decimal | None:
        return _ratio(self.at_risk90, self.principal)

    def as_dict(self) -> dict:
        return {
            "count": self.count,
            "principal": self.principal,
            "par7": self.par7,
            "par30": self.par30,
            "par90": self.par90,
            "at_risk30": self.at_risk30,
            "buckets": self.buckets,
        }


def portfolio_of(rows: list[PortfolioRow]) -> Portfolio:
    by_bucket: dict[str, list] = {key: [0, ZERO] for key in BUCKET_KEYS}
    for row in rows:
        entry = by_bucket[bucket_of(row.days_past_due)]
        entry[0] += 1
        entry[1] += row.principal

    def at_risk(days: int) -> Decimal:
        return sum((r.principal for r in rows if r.days_past_due > days), ZERO)

    return Portfolio(
        count=len(rows),
        principal=sum((r.principal for r in rows), ZERO),
        buckets=[
            {
                "key": key,
                "label": BUCKET_LABELS[key],
                "count": by_bucket[key][0],
                "principal": by_bucket[key][1],
            }
            for key in BUCKET_KEYS
        ],
        at_risk7=at_risk(7),
        at_risk30=at_risk(30),
        at_risk90=at_risk(90),
    )


def portfolio(as_of: dt.date, **filters) -> Portfolio:
    return portfolio_of(portfolio_rows(as_of, **filters))


CUTS = {"sucursal": "branch_id", "cobrador": "collector_id", "producto": "product_id"}


def portfolio_cuts(rows: list[PortfolioRow], by: str) -> list[dict]:
    """The same rows split by branch, collector or product (P60)."""
    from apps.accounts.models import User
    from apps.core.models import Branch
    from apps.lending.models import LoanProduct

    groups: dict[UUID | None, list[PortfolioRow]] = defaultdict(list)
    for row in rows:
        groups[getattr(row, CUTS[by])].append(row)
    if by == "sucursal":
        names = dict(Branch.objects.filter(id__in=groups).values_list("id", "name"))
    elif by == "producto":
        names = dict(LoanProduct.objects.filter(id__in=groups).values_list("id", "name"))
    else:
        names = {
            u.id: u.get_full_name() or u.email
            for u in User.objects.filter(id__in=[k for k in groups if k])
        }
    result = []
    for key, members in groups.items():
        cut = portfolio_of(members)
        result.append(
            {
                "key": str(key) if key else "",
                "name": names.get(key, "Sin cobrador asignado"),
                "count": cut.count,
                "principal": cut.principal,
                "at_risk30": cut.at_risk30,
                "par30": cut.par30,
                "in_arrears": sum(b["count"] for b in cut.buckets if b["key"] != "al_dia"),
            }
        )
    return sorted(result, key=lambda r: r["principal"], reverse=True)


# --- The day's collection ---------------------------------------------------------------------


def collected(day: dt.date, *, branches: Branches = None) -> Decimal:
    from apps.payments.models import Payment, PaymentReversal

    payments = in_branches(
        Payment.objects.filter(value_date=day).exclude(kind=Payment.Kind.MIGRATED),
        "branch_id",
        branches,
    )
    reversals = in_branches(
        PaymentReversal.objects.filter(reversed_on=day).exclude(
            payment__kind=Payment.Kind.MIGRATED
        ),
        "payment__branch_id",
        branches,
    )
    got = payments.aggregate(t=Sum("amount"))["t"] or ZERO
    undone = reversals.aggregate(t=Sum("payment__amount"))["t"] or ZERO
    return got - undone


def _paid_since(day: dt.date, installment_ids: list[UUID]) -> dict[UUID, Decimal]:
    """What payments still in force took from each installment from ``day``
    on: added back, it gives the installment as it stood when the day began."""
    from apps.payments.models import Payment, PaymentAllocation

    rows = (
        PaymentAllocation.objects.filter(
            installment_id__in=installment_ids,
            payment__value_date__gte=day,
            payment__status=Payment.Status.POSTED,
        )
        .values("installment_id")
        .annotate(t=Sum("amount"))
    )
    return {row["installment_id"]: row["t"] for row in rows}


def expected(day: dt.date, *, branches: Branches = None) -> Decimal:
    from apps.collections.models import PaymentPromise
    from apps.lending.models import Installment, Loan
    from apps.payments import portfolio as live

    due = list(
        in_branches(
            Installment.objects.filter(due_date=day, loan__status=Loan.Status.ACTIVE).exclude(
                status=Installment.Status.SUPERSEDED
            ),
            "loan__branch_id",
            branches,
        )
    )
    total = sum(
        (i.principal_outstanding + i.interest_outstanding + i.charges_outstanding for i in due),
        ZERO,
    )
    added_back = [i.id for i in due]
    promised = in_branches(
        Loan.objects.filter(
            status=Loan.Status.ACTIVE,
            promises__promised_on=day,
        ).exclude(promises__status=PaymentPromise.Status.CANCELLED),
        "branch_id",
        branches,
    ).distinct()
    for loan in promised:
        for line in live.position(loan, day):
            if line.installment.due_date < day:
                total += line.total
                added_back.append(line.installment.id)
    return total + sum(_paid_since(day, added_back).values(), ZERO)


def day_collection(day: dt.date, *, branches: Branches = None) -> dict:
    got = collected(day, branches=branches)
    owed = expected(day, branches=branches)
    return {"date": day, "collected": got, "expected": owed, "recovery": _ratio(got, owed)}


# --- Period figures ---------------------------------------------------------------------------


def disbursed(year: int, month: int, *, branches: Branches = None) -> dict:
    from apps.ledger.accounting import month_bounds
    from apps.lending.models import Disbursement

    first, last = month_bounds(year, month)
    rows = in_branches(
        Disbursement.objects.filter(
            disbursed_on__gte=first, disbursed_on__lte=last, reversal_entry__isnull=True
        ),
        "loan__branch_id",
        branches,
    ).aggregate(total=Sum("gross"), count=Count("id"))
    return {"total": rows["total"] or ZERO, "count": rows["count"]}


def promise_compliance(date_from: dt.date, date_to: dt.date, *, branches: Branches = None) -> dict:
    from apps.collections.models import PaymentPromise

    counts = in_branches(
        PaymentPromise.objects.filter(promised_on__gte=date_from, promised_on__lte=date_to),
        "loan__branch_id",
        branches,
    ).aggregate(
        kept=Count("id", filter=Q(status=PaymentPromise.Status.KEPT)),
        broken=Count("id", filter=Q(status=PaymentPromise.Status.BROKEN)),
    )
    kept, broken = counts["kept"], counts["broken"]
    return {"kept": kept, "broken": broken, "rate": _ratio(Decimal(kept), Decimal(kept + broken))}


def cash_differences(date_from: dt.date, date_to: dt.date, *, branches: Branches = None) -> dict:
    from apps.cash.models import CashDifference

    rows = in_branches(
        CashDifference.objects.filter(occurred_on__gte=date_from, occurred_on__lte=date_to),
        "branch_id",
        branches,
    ).aggregate(
        shortage=Sum("amount", filter=Q(kind=CashDifference.Kind.SHORTAGE)),
        overage=Sum("amount", filter=Q(kind=CashDifference.Kind.OVERAGE)),
        count=Count("id"),
    )
    shortage, overage = rows["shortage"] or ZERO, rows["overage"] or ZERO
    return {
        "total": shortage + overage,
        "shortage": shortage,
        "overage": overage,
        "count": rows["count"],
    }


def profit(date_from: dt.date, date_to: dt.date, *, branch_id: UUID | None = None) -> dict:
    """«Ganancia cobrada»: the management results of the period (decision 085)."""
    from apps.ledger.accounting import management_results

    results = management_results(date_from, date_to, branch_id=branch_id)
    return {
        "income": results.income_total,
        "expenses": results.expense_total,
        "result": results.result,
    }
