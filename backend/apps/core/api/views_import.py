"""D1 (decision 131): the portfolio import from the app, for the manager.

GET  /importacion/plantillas/<clientes|prestamos>/  → the Excel template
POST /importacion/<clientes|prestamos>/             → multipart «archivo»,
     «aplicar» (true/false): the report row by row; saves only when every
     row is valid and «aplicar» is true.
"""

from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import IsCompanyManager
from apps.audit.models import record_event
from apps.core import import_templates, importing
from apps.core.models import Company

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsCompanyManager]

    def get(self, request: Request, kind: str) -> HttpResponse:
        if kind not in importing.KINDS:
            return Response(status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(import_templates.template_bytes(kind), content_type=XLSX)
        response["Content-Disposition"] = f'attachment; filename="{kind}.xlsx"'
        return response


class ImportView(APIView):
    permission_classes = [IsAuthenticated, IsCompanyManager]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, kind: str) -> Response:
        if kind not in importing.KINDS:
            return Response(status=status.HTTP_404_NOT_FOUND)
        upload = request.FILES.get("archivo")
        if upload is None:
            raise ValidationError({"archivo": "Sube la plantilla llena."})
        apply = str(request.data.get("aplicar", "")).lower() in ("1", "true", "si", "sí")
        try:
            rows = importing.rows_from_upload(upload.name, upload.read())
            report = importing.run_import(kind=kind, rows=rows, user=request.user, apply=apply)
        except importing.ImportError_ as exc:
            raise ValidationError({"archivo": str(exc)}) from exc
        if report.applied:
            what = "clientes" if kind == "clientes" else "préstamos"
            record_event(
                company_id=request.user.company_id,
                type="import.applied",
                target=Company.objects.get(pk=request.user.company_id),
                actor=request.user,
                summary=f"Importó {report.created} {what} desde {upload.name}",
                data={"kind": kind, "created": report.created, "existing": report.existing},
            )
        return Response(report.as_dict())
