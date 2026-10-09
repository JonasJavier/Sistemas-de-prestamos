"""P62 «Clasificación de clientes» (decision 088): grade, points and why."""

from django.db.models import Count, Q
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.pagination import Pagination
from apps.customers.access import scope_customers
from apps.customers.search import search_customers
from apps.reports import scoring
from apps.reports.models import CustomerScore

CanReadScores = role_required(
    authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL, authz.AUDITORIA, read_any=False
)


def scores_for(user, *, branch=None, grade: str = "", q: str = ""):
    """The scores the user may read: customers of his scope (F1)."""
    rows = scope_customers(CustomerScore.objects.all(), user, field="customer")
    if branch:
        rows = rows.filter(customer__home_branch_id=branch)
    if q:
        from apps.customers.models import Customer

        rows = rows.filter(customer__in=search_customers(q, Customer.objects.all()))
    counts = rows.aggregate(
        total=Count("id"),
        **{grade_: Count("id", filter=Q(grade=grade_)) for grade_, *_ in scoring.GRADES},
        none=Count("id", filter=Q(grade="")),
    )
    if grade == "sin":
        rows = rows.filter(grade="")
    elif grade:
        if grade not in scoring.GRADE_LABELS:
            raise ValidationError({"grado": "Grado inválido."})
        rows = rows.filter(grade=grade)
    return rows, counts


def score_row(score: CustomerScore) -> dict:
    customer = score.customer
    return {
        "customer": {
            "id": str(customer.id),
            "name": customer.display_name,
            "branch": customer.home_branch.name,
        },
        "grade": score.grade,
        "label": scoring.GRADE_LABELS.get(score.grade, "Sin historial"),
        "score": None if score.score is None else str(score.score),
        "previous_grade": score.previous_grade,
        "factors": score.factors,
        "computed_at": score.computed_at,
    }


class ScoresView(APIView):
    permission_classes = [CanReadScores]

    def get(self, request: Request) -> Response:
        params = request.query_params
        rows, counts = scores_for(
            request.user,
            branch=params.get("sucursal") or None,
            grade=params.get("grado", ""),
            q=params.get("q", "").strip(),
        )
        rows = rows.select_related("customer__home_branch").order_by(
            "grade", "-score", "customer__first_name"
        )
        paginator = Pagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        response = paginator.get_paginated_response([score_row(s) for s in page])
        response.data["counts"] = counts
        response.data["grades"] = [
            {"grade": g, "label": label, "min": minimum} for g, minimum, label in scoring.GRADES
        ]
        response.data["weights"] = scoring.WEIGHTS
        return response
