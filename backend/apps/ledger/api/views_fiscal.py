"""Comprobantes fiscales (e-CF) and the 606/607 formats (decision 085)."""

from django.db.models import Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.errors import fail, person
from apps.core.api.pagination import Pagination
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.ledger import fiscal
from apps.ledger.models import FiscalDocument

CanUseFiscal = role_required(
    authz.GERENTE, authz.CONTABILIDAD, read_any=False, read_roles=(authz.AUDITORIA,)
)


def _payload(d: FiscalDocument) -> dict:
    return {
        "id": str(d.id),
        "kind": d.kind,
        "kind_label": d.get_kind_display(),
        "status": d.status,
        "status_label": d.get_status_display(),
        "date": d.date,
        "buyer_name": d.buyer_name,
        "buyer_document": d.buyer_document,
        "concept": d.concept,
        "exempt_amount": str(d.exempt_amount),
        "taxed_amount": str(d.taxed_amount),
        "itbis": str(d.itbis),
        "total": str(d.total),
        "ncf": d.ncf,
        "modifies_ncf": d.modifies.ncf if d.modifies_id else None,
        "issued_at": d.issued_at,
        "issued_by_name": person(d.issued_by) if d.issued_by_id else None,
        "void_reason": d.void_reason,
    }


class FiscalDocumentsView(APIView):
    permission_classes = [CanUseFiscal]

    def get(self, request: Request) -> Response:
        params = request.query_params
        status_ = params.get("estado", FiscalDocument.Status.PENDING)
        rows = FiscalDocument.objects.select_related("modifies", "issued_by").filter(status=status_)
        if params.get("desde"):
            rows = rows.filter(date__gte=params["desde"])
        if params.get("hasta"):
            rows = rows.filter(date__lte=params["hasta"])
        totals = {
            "count": rows.count(),
            "total": str(rows.aggregate(t=Sum("total"))["t"] or 0),
            "pending": FiscalDocument.objects.filter(status=FiscalDocument.Status.PENDING).count(),
        }
        paginator = Pagination()
        page = paginator.paginate_queryset(rows.order_by("date", "created_at"), request, view=self)
        response = paginator.get_paginated_response([_payload(d) for d in page])
        response.data["totals"] = totals
        return response


class FiscalActionView(APIView):
    permission_classes = [CanUseFiscal, CompanyNotSuspendedOrReadOnly]
    verb = ""

    def post(self, request: Request, pk) -> Response:
        document = get_object_or_404(FiscalDocument, pk=pk)
        try:
            if self.verb == "emitir":
                document = fiscal.issue(
                    document=document, user=request.user, ncf=str(request.data.get("ncf", ""))
                )
            else:
                document = fiscal.void(
                    document=document,
                    user=request.user,
                    reason=str(request.data.get("reason", "")),
                )
        except fiscal.FiscalError as exc:
            return fail(exc)
        return Response(_payload(document))


class FiscalExportView(APIView):
    """CSV for Excel: the pending receipts, or the month's 606 or 607."""

    permission_classes = [CanUseFiscal]

    def get(self, request: Request, kind: str) -> HttpResponse:
        if kind == "pendientes":
            content, name = fiscal.pending_csv(), "comprobantes-por-emitir.csv"
        else:
            try:
                year = int(request.query_params["year"])
                month = int(request.query_params["month"])
            except (KeyError, ValueError) as exc:
                raise ValidationError({"month": "Indica el año y el mes."}) from exc
            if not 1 <= month <= 12:
                raise ValidationError({"month": "Mes inválido."})
            builder = {"606": fiscal.format_606, "607": fiscal.format_607}.get(kind)
            if builder is None:
                raise ValidationError({"kind": "Formato desconocido."})
            content, name = builder(year, month), f"formato-{kind}-{year}{month:02d}.csv"
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        return response
