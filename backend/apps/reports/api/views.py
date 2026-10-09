"""P10 «Tablero» by role and P60 «Cartera» (decision 086).

Every figure comes from ``apps.reports.indicators`` so that the dashboard,
the report on screen and its exports never disagree (doc 09 §3). The
scope is the user's branches; managers, accounting and audit see the
whole company and may pick one branch.
"""

import datetime as dt
from decimal import Decimal
from uuid import UUID

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.models import Branch
from apps.reports import indicators

G, SU, OF, CT, AU = (
    authz.GERENTE,
    authz.SUPERVISOR,
    authz.OFICIAL,
    authz.CONTABILIDAD,
    authz.AUDITORIA,
)
INDICATOR_ROLES = (G, SU, CT, AU)
CanReadIndicators = role_required(*INDICATOR_ROLES, read_any=False)


def plain(value):
    """Decimals as strings (money and ratios keep their exact digits)."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [plain(item) for item in value]
    return value


def _uuid(request: Request, key: str) -> UUID | None:
    raw = request.query_params.get(key)
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError as exc:
        raise ValidationError({key: "Valor inválido."}) from exc


def _date(request: Request, key: str, default: dt.date) -> dt.date:
    raw = request.query_params.get(key)
    if not raw:
        return default
    try:
        return dt.date.fromisoformat(raw)
    except ValueError as exc:
        raise ValidationError({key: "Fecha inválida (AAAA-MM-DD)."}) from exc


def scope_of(request: Request) -> tuple[frozenset[UUID] | None, UUID | None]:
    """The branches a figure covers, and the one picked (if any)."""
    scope = authz.branch_scope(request.user)
    picked = _uuid(request, "sucursal")
    if picked is None:
        return scope, None
    if scope is not None and picked not in scope:
        raise NotFound("Sucursal fuera de tu alcance.")
    if not Branch.objects.filter(pk=picked).exists():
        raise NotFound("Sucursal no encontrada.")
    return frozenset({picked}), picked


def scope_label(branches: frozenset[UUID] | None) -> str:
    if branches is None:
        return "Toda la empresa"
    names = sorted(Branch.objects.filter(id__in=branches).values_list("name", flat=True))
    return ", ".join(names) or "Sin sucursal"


def _indicators(today: dt.date, branches, picked, *, with_profit: bool) -> dict:
    first = today.replace(day=1)
    data = {
        "portfolio": indicators.portfolio(today, branches=branches).as_dict(),
        "today": indicators.day_collection(today, branches=branches),
        "disbursed_month": indicators.disbursed(today.year, today.month, branches=branches),
        "promises_month": indicators.promise_compliance(first, today, branches=branches),
        "cash_differences_month": indicators.cash_differences(first, today, branches=branches),
    }
    if with_profit:
        data["profit_month"] = indicators.profit(first, today, branch_id=picked)
    return data


def _operations(today: dt.date, branches) -> dict:
    """Open drawers and today's routes: what a supervisor walks through."""
    from apps.cash.models import CashSession, RouteSession
    from apps.collections.models import RouteStop

    sessions = indicators.in_branches(
        CashSession.objects.filter(status=CashSession.Status.OPEN), "branch_id", branches
    )
    routes = indicators.in_branches(
        RouteSession.objects.filter(business_date=today), "branch_id", branches
    )
    stops = indicators.in_branches(
        RouteStop.objects.filter(date=today), "loan__branch_id", branches
    ).aggregate(
        total=Count("id"),
        visited=Count("id", filter=Q(visited_at__isnull=False)),
        paid=Count("id", filter=Q(payment__isnull=False)),
    )
    return {
        "open_cash_sessions": sessions.count(),
        "routes_open": routes.filter(status=RouteSession.Status.OPEN).count(),
        "routes_total": routes.count(),
        "stops": stops,
    }


def _books(today: dt.date) -> dict:
    """Accounting: where the money is, what is owed soon and the banks
    still to reconcile for last month."""
    from apps.expenses.models import Payable
    from apps.ledger.banking import pending_for_month
    from apps.ledger.models import AccountBalance, FinancialAccount

    accounts = FinancialAccount.objects.filter(
        is_active=True, kind__in=[FinancialAccount.Kind.CASH, FinancialAccount.Kind.BANK]
    ).order_by("kind", "name")
    balances = dict(
        AccountBalance.objects.filter(
            account_id__in=[a.ledger_account_id for a in accounts]
        ).values_list("account_id", "balance")
    )
    week = today + dt.timedelta(days=7)
    due = Payable.objects.filter(
        status__in=[Payable.Status.OPEN, Payable.Status.PARTIAL], due_on__lte=week
    )
    owed = due.aggregate(amount=Sum("amount"), paid=Sum("paid"), count=Count("id"))
    previous = today.replace(day=1) - dt.timedelta(days=1)
    return {
        "accounts": [
            {
                "id": str(a.id),
                "name": a.name,
                "kind": a.kind,
                "balance": balances.get(a.ledger_account_id, Decimal("0.00")),
            }
            for a in accounts
        ],
        "payables_due": {
            "count": owed["count"],
            "overdue": due.filter(due_on__lt=today).count(),
            "total": (owed["amount"] or Decimal("0.00")) - (owed["paid"] or Decimal("0.00")),
        },
        "reconciliations_pending": {
            "month": f"{previous.year}-{previous.month:02d}",
            "accounts": [a.name for a in pending_for_month(previous.year, previous.month)],
        },
    }


def _officer(request: Request, today: dt.date) -> dict:
    from apps.lending.models import Application, Loan

    mine = Application.objects.filter(created_by=request.user)
    by_status = dict(
        mine.exclude(status__in=[Application.Status.DISBURSED, Application.Status.WITHDRAWN])
        .values_list("status")
        .annotate(n=Count("id"))
    )
    soon = Loan.objects.filter(
        officer=request.user,
        status=Loan.Status.ACTIVE,
        next_due_date__gte=today,
        next_due_date__lte=today + dt.timedelta(days=3),
    )
    return {
        "applications": [
            {"status": value, "label": label, "count": by_status.get(value, 0)}
            for value, label in Application.Status.choices
            if value in by_status
        ],
        "due_soon": soon.count(),
        "in_arrears": Loan.objects.filter(
            officer=request.user, status=Loan.Status.ACTIVE, days_past_due__gt=0
        ).count(),
    }


class DashboardView(APIView):
    """P10: one payload with the sections the user's roles may see."""

    def get(self, request: Request) -> Response:
        today = timezone.localdate()
        roles = authz.role_names(request.user)
        branches, picked = scope_of(request)
        data: dict = {
            "date": today,
            "scope": scope_label(branches),
            "definitions": indicators.DEFINITIONS,
        }
        if roles & set(INDICATOR_ROLES):
            whole = authz.branch_scope(request.user) is None
            data["indicators"] = _indicators(today, branches, picked, with_profit=whole)
        if roles & {G, SU, AU}:
            data["operations"] = _operations(today, branches)
        if roles & {G, CT, AU}:
            data["books"] = _books(today)
        if OF in roles:
            data["officer"] = _officer(request, today)
        return Response(plain(data))


class PortfolioReportView(APIView):
    """P60 «Cartera»: balances by branch, collector or product, the aging
    and PAR at any cut date (live today, the nightly snapshot before)."""

    permission_classes = [CanReadIndicators]

    def get(self, request: Request) -> Response:
        today = timezone.localdate()
        as_of = _date(request, "fecha", today)
        if as_of > today:
            raise ValidationError({"fecha": "La fecha de corte no puede ser futura."})
        by = request.query_params.get("corte", "sucursal")
        if by not in indicators.CUTS:
            raise ValidationError({"corte": "Usa sucursal, cobrador o producto."})
        branches, _ = scope_of(request)
        rows = indicators.portfolio_rows(
            as_of,
            branches=branches,
            collector_id=_uuid(request, "cobrador"),
            product_id=_uuid(request, "producto"),
        )
        totals = indicators.portfolio_of(rows)
        return Response(
            plain(
                {
                    "date": as_of,
                    "scope": scope_label(branches),
                    "snapshot": as_of < today,
                    "cut": by,
                    "totals": totals.as_dict(),
                    "rows": indicators.portfolio_cuts(rows, by),
                    "definitions": {
                        key: indicators.DEFINITIONS[key]
                        for key in ("portfolio", "par30", "buckets")
                    },
                }
            )
        )
