"""P64 «Centro de reportes» (decision 087): the catalog the user may read,
each report on screen with its filters, and the background exports
(«Mis exportaciones»)."""

from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.models import Membership
from apps.core.models import Branch
from apps.reports import catalog, exports, indicators, render
from apps.reports.api.views import plain
from apps.reports.models import ExportJob

SCREEN_ROWS = 500


def _options(user) -> dict:
    """What the filter fields offer, already within the user's scope."""
    from apps.lending.models import LoanProduct
    from apps.payments.models import Payment

    scope = authz.branch_scope(user)
    branches = Branch.objects.filter(is_active=True)
    collectors = Membership.objects.filter(role__name=authz.COBRADOR, user__is_active=True)
    if scope is not None:
        branches = branches.filter(id__in=scope)
        collectors = collectors.filter(branch_id__in=scope)
    people = {m.user_id: m.user for m in collectors.select_related("user")}
    return {
        "branch": [{"value": str(b.id), "label": b.name} for b in branches.order_by("name")],
        "collector": sorted(
            ({"value": str(u.id), "label": u.get_full_name() or u.email} for u in people.values()),
            key=lambda row: row["label"],
        ),
        "product": [
            {"value": str(p.id), "label": p.name} for p in LoanProduct.objects.order_by("name")
        ],
        "method": [{"value": value, "label": label} for value, label in Payment.Method.choices],
        "cut": [
            {"value": "sucursal", "label": "Sucursal"},
            {"value": "cobrador", "label": "Cobrador"},
            {"value": "producto", "label": "Producto"},
        ],
        "bucket": [
            {"value": key, "label": label}
            for key, label in indicators.BUCKET_LABELS.items()
            if key != "al_dia"
        ],
    }


def _job(job: ExportJob) -> dict:
    return {
        "id": str(job.id),
        "report": job.report,
        "title": job.title,
        "filters_line": job.filters_line,
        "format": job.format,
        "format_label": job.get_format_display(),
        "status": job.status,
        "status_label": job.get_status_display(),
        "personal": job.personal,
        "rows": job.rows,
        "error": job.error,
        "created_at": job.created_at,
        "finished_at": job.finished_at,
    }


class CatalogView(APIView):
    def get(self, request: Request) -> Response:
        reports = catalog.available(request.user)
        return Response(
            {
                "reports": [
                    {
                        "key": r.key,
                        "title": r.title,
                        "description": r.description,
                        "group": r.group,
                        "filters": [
                            {"key": f.key, "label": f.label, "kind": f.kind} for f in r.filters
                        ],
                    }
                    for r in reports
                ],
                "options": _options(request.user) if reports else {},
                "can_export": catalog.can_export(request.user),
                "exports_personal": catalog.exports_personal(request.user),
            }
        )


def _build(request: Request, key: str, filters: dict) -> catalog.Table:
    try:
        return catalog.build(request.user, key, filters)
    except catalog.ReportError as exc:
        raise ValidationError({exc.field: exc.message}) from exc


class ReportView(APIView):
    """The report on screen: the same Table the PDF and the Excel render."""

    def get(self, request: Request, key: str) -> Response:
        table = _build(request, key, request.query_params.dict())
        return Response(plain(render.as_json(table, limit=SCREEN_ROWS)))


class ExportView(APIView):
    # A suspended company still exports what it may read (F19 step 3).
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, key: str) -> Response:
        filters = request.data.get("filters") or {}
        if not isinstance(filters, dict):
            raise ValidationError({"filters": "Filtros inválidos."})
        try:
            job = exports.request_export(
                user=request.user, report=key, fmt=request.data.get("format", ""), filters=filters
            )
        except catalog.ReportError as exc:
            raise ValidationError({exc.field: exc.message}) from exc
        except exports.ExportError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response(_job(job), status=status.HTTP_202_ACCEPTED)


class MyExportsView(APIView):
    def get(self, request: Request) -> Response:
        jobs = ExportJob.objects.filter(user=request.user).order_by("-created_at")[:30]
        return Response([_job(job) for job in jobs])


class ExportFileView(APIView):
    """Only its owner downloads an export, while it has not expired."""

    def get(self, request: Request, pk) -> HttpResponse:
        job = get_object_or_404(ExportJob, pk=pk, user=request.user)
        if job.status != ExportJob.Status.DONE or not job.file:
            raise Http404("La exportación no está disponible.")
        with job.file.open("rb") as handle:
            content = handle.read()
        kind = (
            "application/pdf"
            if job.format == ExportJob.Format.PDF
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response = HttpResponse(content, content_type=kind)
        name = f"{job.report}-{job.created_at:%Y%m%d-%H%M}.{job.format}"
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        return response
