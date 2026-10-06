"""P26-P32: applications, decision, disbursement and the loan file.

Views translate HTTP to the F3/F4 services and back; every rule lives in
``apps.lending.applications`` and ``apps.lending.disbursement`` (checked
again there, whatever the permission classes let through).
"""

from django.db import transaction
from django.db.models import Q, QuerySet
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.audit.models import DomainEvent, SensitiveAccessLog
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.customers.api.views_expediente import SIGNED_FILE_MODELS, _PrivateFileViewSet
from apps.documents.models import GeneratedDocument
from apps.documents.services import ensure_loan_documents
from apps.ledger.models import FinancialAccount
from apps.lending import applications as flow
from apps.lending import disbursement as payout
from apps.lending.api.serializers_origination import (
    ApplicationCollateralSerializer,
    ApplicationFileSerializer,
    ApplicationListSerializer,
    ApplicationSerializer,
    ApproveSerializer,
    BudgetItemSerializer,
    DisburseSerializer,
    EventSerializer,
    GuarantorSerializer,
    InstallmentSerializer,
    LoanFileSerializer,
    LoanListSerializer,
    LoanSerializer,
    NoteSerializer,
    RejectSerializer,
    RequirementSerializer,
    TermsSerializer,
    VerifyRequirementSerializer,
    VoidSerializer,
)
from apps.lending.models import (
    Application,
    ApplicationBudgetItem,
    ApplicationCollateral,
    ApplicationFile,
    ApplicationGuarantor,
    ApplicationRequirement,
    Loan,
    LoanFile,
)

G, SU, OF = authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL
CA, CO, CT, AU = authz.CAJERO, authz.COBRADOR, authz.CONTABILIDAD, authz.AUDITORIA

# Doc 06 matrix. Applications: G/Su/O create and edit; the cashier and
# accounting read the approved ones to disburse; audit reads everything.
CanOriginate = role_required(G, SU, OF, read_any=False, read_roles=(CA, CT, AU))
CanDecide = role_required(G, SU, read_any=False)
CanDisburse = role_required(G, CA, CT, read_any=False)
# Loans: everyone but the administrator reads (the collector, only his own).
CanReadLoans = role_required(G, SU, read_any=False, read_roles=(OF, CA, CO, CT, AU))
CanHandleSignedNote = role_required(G, SU, OF, CA, CT, read_any=False)

FORBIDDEN_CODES = {"forbidden", "out_of_scope"}

SIGNED_FILE_MODELS["application_file"] = ApplicationFile


def _fail(exc: flow.ApplicationError) -> Response:
    code = status.HTTP_403_FORBIDDEN if exc.code in FORBIDDEN_CODES else status.HTTP_400_BAD_REQUEST
    return Response({"detail": str(exc), "code": exc.code, "issues": exc.issues}, status=code)


def _scoped(queryset: QuerySet, user) -> QuerySet:
    scope = authz.branch_scope(user)
    return queryset if scope is None else queryset.filter(branch_id__in=scope)


def _evaluation_payload(evaluation: flow.Evaluation) -> dict:
    sim = evaluation.simulation
    return {
        "monthly_income": str(evaluation.monthly_income),
        "monthly_expenses": str(evaluation.monthly_expenses),
        "available": str(evaluation.available),
        "monthly_payment": str(evaluation.monthly_payment),
        "capacity_ratio": None
        if evaluation.capacity_ratio is None
        else str(evaluation.capacity_ratio),
        "capacity_alert_ratio": str(evaluation.capacity_alert_ratio),
        "coverage": None if evaluation.coverage is None else str(evaluation.coverage),
        "min_coverage": None if evaluation.min_coverage is None else str(evaluation.min_coverage),
        "requirements_total": evaluation.requirements_total,
        "requirements_verified": evaluation.requirements_verified,
        "references_total": evaluation.references_total,
        "references_verified": evaluation.references_verified,
        "previous_applications": evaluation.previous_applications,
        "loans_total": evaluation.loans_total,
        "loans_active": evaluation.loans_active,
        "customer_blocked": evaluation.customer_blocked,
        "has_bureau": evaluation.has_bureau,
        "guarantors": evaluation.guarantors,
        "collaterals": evaluation.collaterals,
        "alerts": evaluation.alerts,
        "simulation": _simulation_payload(sim),
    }


def _simulation_payload(sim) -> dict:
    return {
        "principal": str(sim.principal),
        "requested_amount": str(sim.requested_amount),
        "net_disbursed": str(sim.net_disbursed),
        "periodic_rate": str(sim.periodic_rate),
        "monthly_rate": str(sim.monthly_rate),
        "annual_rate": str(sim.annual_rate),
        "total_interest": str(sim.total_interest),
        "total_charges": str(sim.total_charges),
        "total_to_pay": str(sim.total_to_pay),
        "charges": [
            {"name": line.name, "mode": line.mode, "amount": str(line.amount)}
            for line in sim.charges
        ],
        "schedule": [
            {
                "number": row.number,
                "due_date": row.due_date.isoformat(),
                "original_due_date": row.original_due_date.isoformat(),
                "principal": str(row.principal),
                "interest": str(row.interest),
                "total": str(row.total),
            }
            for row in sim.schedule
        ],
    }


class ApplicationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """P26/P27/P28: never deleted; drafts are withdrawn instead (#22)."""

    permission_classes = [CanOriginate, CompanyNotSuspendedOrReadOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status", "customer", "product"]

    def get_queryset(self) -> QuerySet[Application]:
        user = self.request.user
        queryset = Application.objects.select_related(
            "customer", "product", "branch", "created_by", "assigned_approver", "decided_by"
        ).order_by("-created_at")
        tray = self.request.query_params.get("bandeja")
        if tray == "por_aprobar" and self.action == "list":
            queryset = flow.pending_for(user).select_related(
                "customer", "product", "branch", "created_by", "assigned_approver"
            )
        elif tray == "mias":
            queryset = queryset.filter(
                created_by=user,
                status__in=[Application.Status.DRAFT, Application.Status.RETURNED],
            )
        elif tray == "por_desembolsar":
            queryset = queryset.filter(
                status=Application.Status.APPROVED, valid_until__gte=timezone.localdate()
            )
        q = self.request.query_params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(number__icontains=q)
                | Q(customer__first_name__unaccent__icontains=q)
                | Q(customer__last_name__unaccent__icontains=q)
                | Q(customer__legal_name__unaccent__icontains=q)
            )
        return _scoped(queryset, user).order_by("-created_at")

    def get_serializer_class(self):
        return ApplicationListSerializer if self.action == "list" else ApplicationSerializer

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        application = self.get_object()
        data = ApplicationSerializer(application).data
        data["budget_items"] = BudgetItemSerializer(
            application.budget_items.order_by("kind", "created_at"), many=True
        ).data
        data["guarantors"] = GuarantorSerializer(
            application.guarantors.select_related("customer"), many=True
        ).data
        data["collaterals"] = ApplicationCollateralSerializer(
            application.collaterals.select_related("collateral"), many=True
        ).data
        data["requirements"] = RequirementSerializer(
            application.requirements.select_related("verified_by").order_by("name"), many=True
        ).data
        data["files"] = ApplicationFileSerializer(
            application.files.select_related("uploaded_by").order_by("-created_at"), many=True
        ).data
        user = request.user
        data["can"] = {
            "edit": application.status in Application.EDITABLE
            and authz.has_any_role(user, G, SU, OF),
            "submit": application.status in Application.SUBMITTABLE
            and authz.has_any_role(user, G, SU, OF),
            "decide": application.status == Application.Status.IN_REVIEW
            and flow._decider_problem(application, user, amount=None) is None,
            "disburse": application.status == Application.Status.APPROVED
            and authz.has_any_role(user, G, CA, CT)
            and user.pk != application.decided_by_id,
            "withdraw": application.status in Application.WITHDRAWABLE
            and authz.has_any_role(user, G, SU, OF),
        }
        return Response(data)

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ApplicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            application = flow.create_application(
                user=request.user,
                customer=data["customer"],
                product=data["product"],
                amount=data["amount"],
                frequency=data["frequency"],
                installments=data["installments"],
                rate=data.get("rate"),
                first_due=data.get("first_due"),
                purpose=data.get("purpose", ""),
                notes=data.get("notes", ""),
            )
        except flow.ApplicationError as exc:
            return _fail(exc)
        return Response(ApplicationSerializer(application).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        application = self.get_object()
        serializer = ApplicationSerializer(application, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)
        changes.pop("customer", None)  # the borrower never changes on an application
        try:
            application = flow.update_application(application, user=request.user, **changes)
        except flow.ApplicationError as exc:
            return _fail(exc)
        return Response(ApplicationSerializer(application).data)

    @action(detail=True, methods=["get"])
    def evaluacion(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        try:
            evaluation = flow.evaluate(application)
        except flow.ApplicationError as exc:
            return _fail(exc)
        return Response(_evaluation_payload(evaluation))

    @action(detail=True, methods=["get"])
    def eventos(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        events = DomainEvent.objects.filter(
            target_type="lending.application", target_id=application.pk
        ).select_related("actor")
        return Response(EventSerializer(events.order_by("created_at"), many=True).data)

    def _transition(self, request: Request, fn, **kwargs) -> Response:
        application = self.get_object()
        try:
            application = fn(application, user=request.user, **kwargs)
        except flow.ApplicationError as exc:
            return _fail(exc)
        return Response(ApplicationSerializer(application).data)

    @action(detail=True, methods=["post"])
    def enviar(self, request: Request, pk: str | None = None) -> Response:
        return self._transition(request, flow.submit)

    @action(detail=True, methods=["post"], permission_classes=[CanDecide])
    def aprobar(self, request: Request, pk: str | None = None) -> Response:
        serializer = ApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        note = data.pop("note", "")
        return self._transition(request, flow.approve, adjustments=data, note=note)

    @action(detail=True, methods=["post"], permission_classes=[CanDecide])
    def rechazar(self, request: Request, pk: str | None = None) -> Response:
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._transition(
            request,
            flow.reject,
            reason=serializer.validated_data["reason"],
            note=serializer.validated_data["note"],
        )

    @action(detail=True, methods=["post"], permission_classes=[CanDecide])
    def devolver(self, request: Request, pk: str | None = None) -> Response:
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._transition(
            request, flow.return_to_officer, note=serializer.validated_data.get("note", "")
        )

    @action(detail=True, methods=["post"])
    def desistir(self, request: Request, pk: str | None = None) -> Response:
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._transition(
            request, flow.withdraw, note=serializer.validated_data.get("note", "")
        )

    @action(detail=True, methods=["get"], url_path="desembolso", permission_classes=[CanDisburse])
    def disbursement_preview(self, request: Request, pk: str | None = None) -> Response:
        """P30: net to hand over, charges, first due date and source accounts."""
        application = self.get_object()
        try:
            quote = payout.preview(application)
        except flow.ApplicationError as exc:
            return _fail(exc)
        except Exception:  # noqa: BLE001 - product changed under the approval
            return Response(
                {
                    "detail": "Las condiciones aprobadas ya no cumplen el producto.",
                    "code": "out_of_range",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        accounts = FinancialAccount.objects.filter(is_active=True).filter(
            Q(branch__isnull=True) | Q(branch_id=application.branch_id)
        )
        return Response(
            {
                "simulation": _simulation_payload(quote.simulation),
                "discounted_charges": str(quote.discounted),
                "financed_charges": str(quote.financed),
                "cash_charges": str(quote.cash),
                "accounts": [
                    {
                        "id": str(account.id),
                        "name": str(account),
                        "kind": account.kind,
                        "balance": str(account.ledger_account.balance.balance),
                    }
                    for account in accounts.select_related("ledger_account__balance").order_by(
                        "kind", "name"
                    )
                ],
                "blockers": [
                    message
                    for condition, message in (
                        (
                            request.user.pk == application.decided_by_id,
                            "Quien aprobó la solicitud no la desembolsa.",
                        ),
                        (
                            application.customer.status == "blocked",
                            "El cliente está bloqueado.",
                        ),
                    )
                    if condition
                ],
            }
        )

    @action(detail=True, methods=["post"], permission_classes=[CanDisburse])
    def desembolsar(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        serializer = DisburseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            loan = payout.disburse(
                application=application,
                user=request.user,
                source_account=data["source_account"],
                charge_account=data.get("charge_account"),
                method=data["method"],
                reference=data.get("reference", ""),
                idempotency_key=data["idempotency_key"],
            )
        except flow.ApplicationError as exc:
            return _fail(exc)
        user = request.user
        # The pagaré carries the final loan number, so it is issued once the
        # disbursement commits; if this fails, the loan file issues it lazily.
        transaction.on_commit(lambda: ensure_loan_documents(loan, issued_by=user), robust=True)
        return Response({"loan": loan.number, "id": str(loan.id)}, status=status.HTTP_201_CREATED)


class _ApplicationChildViewSet(viewsets.ModelViewSet):
    permission_classes = [CanOriginate, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["application"]
    pagination_class = None
    editable_statuses = Application.EDITABLE

    def get_queryset(self):
        return self.model.objects.filter(
            application__in=_scoped(Application.objects.all(), self.request.user)
        ).order_by("created_at")

    def _check_editable(self, instance) -> None:
        if instance.application.status not in self.editable_statuses:
            raise ValidationError(
                {"detail": "Solo se modifican borradores y solicitudes devueltas."}
            )

    def perform_update(self, serializer) -> None:
        self._check_editable(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance) -> None:
        self._check_editable(instance)
        instance.delete()


class BudgetItemViewSet(_ApplicationChildViewSet):
    model = ApplicationBudgetItem
    serializer_class = BudgetItemSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class GuarantorViewSet(_ApplicationChildViewSet):
    model = ApplicationGuarantor
    serializer_class = GuarantorSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]


class ApplicationCollateralViewSet(_ApplicationChildViewSet):
    model = ApplicationCollateral
    serializer_class = ApplicationCollateralSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class RequirementViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The product checklist; verifying records who and when (F3 step 2)."""

    permission_classes = [CanOriginate, CompanyNotSuspendedOrReadOnly]
    serializer_class = RequirementSerializer
    filterset_fields = ["application"]
    pagination_class = None
    verifiable = Application.EDITABLE | {Application.Status.IN_REVIEW}

    def get_queryset(self):
        return ApplicationRequirement.objects.filter(
            application__in=_scoped(Application.objects.all(), self.request.user)
        ).select_related("verified_by", "application")

    def _set(self, request: Request, verified: bool) -> Response:
        requirement = self.get_object()
        if requirement.application.status not in self.verifiable:
            raise ValidationError({"detail": "La solicitud ya no admite cambios en documentos."})
        serializer = VerifyRequirementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = serializer.validated_data.get("file")
        if file is not None and file.application_id != requirement.application_id:
            raise ValidationError({"file": "El archivo es de otra solicitud."})
        requirement.verified_by = request.user if verified else None
        requirement.verified_at = timezone.now() if verified else None
        if verified and file is not None:
            requirement.file = file
        requirement.save()
        return Response(RequirementSerializer(requirement).data)

    @action(detail=True, methods=["post"])
    def verificar(self, request: Request, pk: str | None = None) -> Response:
        return self._set(request, verified=True)

    @action(detail=True, methods=["post"])
    def desmarcar(self, request: Request, pk: str | None = None) -> Response:
        return self._set(request, verified=False)


class ApplicationFileViewSet(_PrivateFileViewSet):
    """Bureau report and documents: same private-file rules as customers."""

    serializer_class = ApplicationFileSerializer
    permission_classes = [CanOriginate, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["application", "kind"]
    target_type = "application_file"

    def get_queryset(self):
        return (
            ApplicationFile.objects.filter(
                application__in=_scoped(Application.objects.all(), self.request.user)
            )
            .select_related("uploaded_by", "application")
            .order_by("-created_at")
        )

    def _detail(self, file: ApplicationFile) -> str:
        return f"{file.get_kind_display()} de la solicitud {file.application.number}"

    def perform_destroy(self, instance: ApplicationFile) -> None:
        if instance.application.status not in Application.EDITABLE:
            raise ValidationError({"detail": "Solo se eliminan archivos de borradores."})
        instance.delete()


class LoanViewSet(viewsets.ReadOnlyModelViewSet):
    """P31/P32: loans by number (``/prestamos/SD-000125``)."""

    permission_classes = [CanReadLoans, CompanyNotSuspendedOrReadOnly]
    lookup_field = "number"
    lookup_value_regex = r"[^/]+"
    filterset_fields = ["status", "product", "branch", "customer"]

    def get_queryset(self) -> QuerySet[Loan]:
        user = self.request.user
        queryset = Loan.objects.select_related(
            "customer", "product", "branch", "officer", "application"
        )
        # The collector sees only the loans assigned to him (doc 06: «P»).
        if authz.role_names(user) <= {CO}:
            queryset = queryset.filter(collector=user)
        q = self.request.query_params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(number__icontains=q)
                | Q(customer__first_name__unaccent__icontains=q)
                | Q(customer__last_name__unaccent__icontains=q)
                | Q(customer__legal_name__unaccent__icontains=q)
            )
        return _scoped(queryset, user).order_by("-disbursed_on", "-created_at")

    def get_serializer_class(self):
        return LoanListSerializer if self.action == "list" else LoanSerializer

    @action(detail=True, methods=["get"])
    def calendario(self, request: Request, number: str | None = None) -> Response:
        loan = self.get_object()
        return Response(
            {
                "versions": TermsSerializer(loan.terms.order_by("version"), many=True).data,
                "installments": InstallmentSerializer(
                    loan.installments.select_related("terms").order_by("terms__version", "number"),
                    many=True,
                ).data,
            }
        )

    @action(detail=True, methods=["get"])
    def eventos(self, request: Request, number: str | None = None) -> Response:
        loan = self.get_object()
        targets = Q(target_type="lending.loan", target_id=loan.pk)
        if loan.application_id:
            targets |= Q(target_type="lending.application", target_id=loan.application_id)
        events = DomainEvent.objects.filter(targets).select_related("actor")
        return Response(EventSerializer(events.order_by("created_at"), many=True).data)

    @action(detail=True, methods=["get"])
    def documentos(self, request: Request, number: str | None = None) -> Response:
        loan = self.get_object()
        documents = ensure_loan_documents(loan, issued_by=request.user)
        signed = loan.files.filter(kind=LoanFile.Kind.SIGNED_PROMISSORY_NOTE).first()
        return Response(
            {
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
                "signed_note": None
                if signed is None
                else {"id": str(signed.id), "uploaded_at": signed.created_at},
            }
        )

    @action(detail=True, methods=["get"], url_path=r"documentos/(?P<doc_id>[0-9a-f-]+)")
    def documento(self, request: Request, number: str | None = None, doc_id: str = "") -> Response:
        loan = self.get_object()
        document = get_object_or_404(
            GeneratedDocument, pk=doc_id, target_type="lending.loan", target_id=loan.pk
        )
        SensitiveAccessLog.objects.create(
            company_id=loan.company_id,
            user=request.user,
            action=SensitiveAccessLog.Action.DOCUMENT,
            target_type="generated_document",
            target_id=document.id,
            detail=f"{document.get_kind_display()} {document.folio}",
        )
        return FileResponse(
            document.file.open("rb"),
            content_type="application/pdf",
            filename=f"{document.folio}.pdf",
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="pagare-firmado",
        permission_classes=[CanHandleSignedNote],
        parser_classes=[MultiPartParser, FormParser],
    )
    def signed_note(self, request: Request, number: str | None = None) -> Response:
        """F4 step 5: the scanned signed pagaré closes «pendiente de firma»."""
        loan = self.get_object()
        serializer = LoanFileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            company_id=loan.company_id,
            loan=loan,
            kind=LoanFile.Kind.SIGNED_PROMISSORY_NOTE,
            uploaded_by=request.user,
        )
        loan.promissory_note_signed_at = timezone.now()
        loan.save(update_fields=["promissory_note_signed_at", "updated_at"])
        return Response(LoanSerializer(loan).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[CanDecide])
    def anular(self, request: Request, number: str | None = None) -> Response:
        loan = self.get_object()
        serializer = VoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            loan = payout.void_loan(
                loan,
                user=request.user,
                reason=serializer.validated_data["reason"],
                note=serializer.validated_data["note"],
            )
        except flow.ApplicationError as exc:
            return _fail(exc)
        return Response(LoanSerializer(loan).data)
