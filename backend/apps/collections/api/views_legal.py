"""P46 «Casos legales» and P78 «Profesionales legales» (decision 095)."""

from decimal import Decimal, InvalidOperation

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.audit.models import SensitiveAccessLog
from apps.collections import legal
from apps.collections.models import LegalCase, LegalProfessional
from apps.core.api.errors import person
from apps.customers.access import scope_loans
from apps.documents import legal as legal_docs
from apps.documents.models import GeneratedDocument
from apps.ledger.models import FinancialAccount
from apps.lending.models import Loan

CanSeeCases = role_required(authz.GERENTE, read_any=False, read_roles=(authz.AUDITORIA,))
CanKeepCatalog = role_required(
    authz.GERENTE, authz.ADMINISTRADOR, read_any=False, read_roles=(authz.AUDITORIA,)
)


def _fail(exc) -> Response:
    code = getattr(exc, "code", "invalid")
    http = status.HTTP_403_FORBIDDEN if code == "forbidden" else status.HTTP_400_BAD_REQUEST
    return Response({"detail": getattr(exc, "message", str(exc)), "code": code}, status=http)


def _professional(p: LegalProfessional | None) -> dict | None:
    if p is None:
        return None
    return {
        "id": str(p.id),
        "kind": p.kind,
        "kind_label": p.get_kind_display(),
        "name": p.name,
        "document": p.document,
        "license": p.license,
        "phone": p.phone,
        "address": p.address,
        "parent": str(p.parent_id) if p.parent_id else None,
        "is_active": p.is_active,
    }


def _pick(data, key: str, kind: str | None = None) -> LegalProfessional | None:
    value = data.get(key)
    if not value:
        return None
    query = LegalProfessional.objects.filter(pk=value)
    if kind:
        query = query.filter(kind=kind)
    found = query.first()
    if found is None:
        raise ValidationError({key: "No existe en el catálogo."})
    return found


class ProfessionalsView(APIView):
    permission_classes = [CanKeepCatalog]

    def get(self, request: Request) -> Response:
        rows = LegalProfessional.objects.order_by("kind", "name")
        return Response([_professional(p) for p in rows])

    def post(self, request: Request) -> Response:
        data = request.data
        try:
            professional = legal.save_professional(
                user=request.user,
                kind=str(data.get("kind", "")),
                name=str(data.get("name", "")),
                document=str(data.get("document", "")),
                license=str(data.get("license", "")),
                phone=str(data.get("phone", "")),
                address=str(data.get("address", "")),
                parent=_pick(data, "parent", LegalProfessional.Kind.LAWYER),
            )
        except legal.LegalError as exc:
            return _fail(exc)
        return Response(_professional(professional), status=status.HTTP_201_CREATED)


class ProfessionalDetailView(APIView):
    permission_classes = [CanKeepCatalog]

    def patch(self, request: Request, pk) -> Response:
        professional = get_object_or_404(LegalProfessional, pk=pk)
        fields = {
            key: str(request.data[key])
            for key in ("name", "document", "license", "phone", "address")
            if key in request.data
        }
        if "is_active" in request.data:
            fields["is_active"] = bool(request.data["is_active"])
        if "parent" in request.data:
            fields["parent"] = _pick(request.data, "parent", LegalProfessional.Kind.LAWYER)
        try:
            professional = legal.save_professional(
                user=request.user, professional=professional, **fields
            )
        except legal.LegalError as exc:
            return _fail(exc)
        return Response(_professional(professional))


def _case_row(case: LegalCase) -> dict:
    loan = case.loan
    return {
        "id": str(case.id),
        "number": case.number,
        "status": case.status,
        "status_label": case.get_status_display(),
        "outcome": case.outcome,
        "outcome_label": case.get_outcome_display() if case.outcome else "",
        "loan": {
            "number": loan.number,
            "status": loan.status,
            "customer": loan.customer.display_name,
            "days_past_due": loan.days_past_due,
            "principal_outstanding": str(loan.principal_outstanding),
        },
        "lawyer": _professional(case.lawyer),
        "bailiff": _professional(case.bailiff),
        "notary": _professional(case.notary),
        "opened_on": case.opened_on,
        "opened_by": person(case.opened_by),
        "note": case.note,
        "closed_on": case.closed_on,
        "close_note": case.close_note,
    }


def _scoped_cases(user):
    loans = scope_loans(Loan.objects.all(), user)
    return LegalCase.objects.filter(loan__in=loans).select_related(
        "loan__customer", "lawyer", "bailiff", "notary", "opened_by"
    )


class CasesView(APIView):
    permission_classes = [CanSeeCases]

    def get(self, request: Request) -> Response:
        state = request.query_params.get("estado", "")
        cases = _scoped_cases(request.user)
        if state == "abiertos":
            cases = cases.exclude(status=LegalCase.Status.CLOSED)
        elif state == "cerrados":
            cases = cases.filter(status=LegalCase.Status.CLOSED)
        return Response([_case_row(case) for case in cases.order_by("-opened_on", "-number")])

    def post(self, request: Request) -> Response:
        loan = get_object_or_404(
            scope_loans(Loan.objects.all(), request.user), number=request.data.get("loan", "")
        )
        try:
            case = legal.open_case(
                loan=loan,
                user=request.user,
                lawyer=_pick(request.data, "lawyer"),
                bailiff=_pick(request.data, "bailiff"),
                notary=_pick(request.data, "notary"),
                note=str(request.data.get("note", "")),
            )
        except legal.LegalError as exc:
            return _fail(exc)
        except AttributeError:
            return _fail(legal.LegalError("Elige el abogado del caso.", "lawyer"))
        return Response(_case_row(case), status=status.HTTP_201_CREATED)


class CaseDetailView(APIView):
    permission_classes = [CanSeeCases]

    def get(self, request: Request, pk) -> Response:
        case = get_object_or_404(_scoped_cases(request.user), pk=pk)
        documents = GeneratedDocument.objects.filter(
            target_type="collections.legalcase", target_id=case.id
        ).order_by("created_at")
        exigible = (
            legal_docs.exigible(case.loan)
            if case.loan.status in (Loan.Status.ACTIVE, Loan.Status.WRITTEN_OFF)
            else Decimal("0.00")
        )
        return Response(
            {
                **_case_row(case),
                "exigible": str(exigible),
                "costs": [
                    {
                        "id": str(cost.id),
                        "date": cost.date,
                        "description": cost.description,
                        "amount": str(cost.amount),
                        "paid": cost.expense_id is not None,
                        "charged": cost.charged,
                    }
                    for cost in case.costs.order_by("date", "created_at")
                ],
                "documents": [
                    {
                        "id": str(doc.id),
                        "kind": doc.kind,
                        "label": doc.get_kind_display(),
                        "folio": doc.folio,
                        "legal_status": doc.legal_status,
                        "created_at": doc.created_at,
                    }
                    for doc in documents
                ],
            }
        )

    def patch(self, request: Request, pk) -> Response:
        case = get_object_or_404(_scoped_cases(request.user), pk=pk)
        fields: dict = {}
        if "status" in request.data:
            fields["status"] = str(request.data["status"])
        for key, kind in (
            ("lawyer", LegalProfessional.Kind.LAWYER),
            ("bailiff", LegalProfessional.Kind.BAILIFF),
            ("notary", LegalProfessional.Kind.NOTARY),
        ):
            if key in request.data:
                fields[key] = _pick(request.data, key, kind)
        if "note" in request.data:
            fields["note"] = str(request.data["note"])
        try:
            case = legal.update_case(case=case, user=request.user, **fields)
        except legal.LegalError as exc:
            return _fail(exc)
        return Response(_case_row(case))


class CloseCaseView(APIView):
    permission_classes = [CanSeeCases]

    def post(self, request: Request, pk) -> Response:
        case = get_object_or_404(_scoped_cases(request.user), pk=pk)
        try:
            case = legal.close_case(
                case=case,
                user=request.user,
                outcome=str(request.data.get("outcome", "")),
                note=str(request.data.get("note", "")),
            )
        except legal.LegalError as exc:
            return _fail(exc)
        return Response(_case_row(case))


class CostsView(APIView):
    permission_classes = [CanSeeCases]

    def post(self, request: Request, pk) -> Response:
        case = get_object_or_404(_scoped_cases(request.user), pk=pk)
        data = request.data
        try:
            amount = Decimal(str(data.get("amount", "")))
        except InvalidOperation as exc:
            raise ValidationError({"amount": "Monto inválido."}) from exc
        account = None
        if data.get("account"):
            account = get_object_or_404(
                FinancialAccount.objects.filter(
                    is_active=True,
                    kind__in=[FinancialAccount.Kind.CASH, FinancialAccount.Kind.BANK],
                ),
                pk=data["account"],
            )
        try:
            cost = legal.add_cost(
                case=case,
                user=request.user,
                description=str(data.get("description", "")),
                amount=amount,
                date=timezone.localdate(),
                account=account,
                party_name=str(data.get("party_name", "")),
                ncf=str(data.get("ncf", "")),
                charge_customer=data.get("charge_customer") in (True, "true", "1", 1),
            )
        except legal.LegalError as exc:
            return _fail(exc)
        return Response({"id": str(cost.id)}, status=status.HTTP_201_CREATED)


class CaseDocumentView(APIView):
    """POST issues the PDF (kept); GET ?formato=docx gives the editable one."""

    permission_classes = [CanSeeCases]

    def _log(self, request: Request, case: LegalCase, detail: str, target_id) -> None:
        SensitiveAccessLog.objects.create(
            company_id=case.company_id,
            user=request.user,
            action=SensitiveAccessLog.Action.DOCUMENT,
            target_type="generated_document",
            target_id=target_id,
            detail=detail[:300],
        )

    def post(self, request: Request, pk, kind: str) -> Response:
        case = get_object_or_404(_scoped_cases(request.user), pk=pk)
        if not authz.has_any_role(request.user, authz.GERENTE):
            return Response({"detail": "Los emite el gerente.", "code": "forbidden"}, status=403)
        try:
            document = legal_docs.issue_legal(case, kind, issued_by=request.user)
        except legal_docs.LegalDocumentError as exc:
            return _fail(exc)
        self._log(request, case, f"{document.get_kind_display()} {document.folio}", document.id)
        return Response(
            {"id": str(document.id), "folio": document.folio, "label": document.get_kind_display()},
            status=status.HTTP_201_CREATED,
        )

    def get(self, request: Request, pk, kind: str) -> HttpResponse:
        case = get_object_or_404(_scoped_cases(request.user), pk=pk)
        if kind == "archivo":
            document = get_object_or_404(
                GeneratedDocument.objects.filter(
                    target_type="collections.legalcase", target_id=case.id
                ),
                pk=request.query_params.get("id"),
            )
            self._log(request, case, f"{document.get_kind_display()} {document.folio}", document.id)
            with document.file.open("rb") as handle:
                response = HttpResponse(handle.read(), content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{document.folio}.pdf"'
            return response
        try:
            content = legal_docs.docx(case, kind)
        except legal_docs.LegalDocumentError as exc:
            return _fail(exc)
        self._log(request, case, f"{kind} (DOCX editable) del caso {case.number}", case.id)
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{case.number}-{kind}.docx"'
        return response
