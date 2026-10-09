"""P33-P36, P43 and P11: the payment screen, receipts, reversals, payoff
letters, the delinquency tray and the authorizations.

Views translate HTTP to the services, where every rule is checked again.
"""

import datetime as dt
import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, DecimalField, Exists, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.accounts.models import ApprovalLimit
from apps.accounts.reauth import confirm_identity
from apps.audit.models import SensitiveAccessLog
from apps.cash import services as cash
from apps.collections.models import CollectionAction, PaymentPromise
from apps.core.api.errors import fail, person
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import ApprovalRequest, PublicLink
from apps.core.tenancy import company_context
from apps.customers.access import scope_loans
from apps.customers.validators import mask_document
from apps.documents.models import GeneratedDocument
from apps.ledger.models import FinancialAccount
from apps.lending.models import Installment, Loan
from apps.payments import letters, portfolio, reversals
from apps.payments.api.serializers import (
    ApprovalSerializer,
    AuthorizationRequestSerializer,
    DecisionSerializer,
    PaymentListSerializer,
    PaymentRequestSerializer,
    ReversalRequestSerializer,
    receipt_payload,
)
from apps.payments.models import Payment
from apps.payments.services import PaymentError, plan_prepayment, post_payment

G, SU, OF = authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL
CA, CO, CT, AU = authz.CAJERO, authz.COBRADOR, authz.CONTABILIDAD, authz.AUDITORIA
ZERO = Decimal("0.00")

CanCollect = role_required(G, SU, CA, CO, read_any=False)
CanSeeReceipts = role_required(G, SU, CA, CO, read_any=False, read_roles=(OF, CT, AU))
CanSeeDelinquency = role_required(G, SU, OF, CT, AU, read_any=False)
CanIssueLetters = role_required(G, SU, OF, CA, read_any=False)


def _loan(request: Request, number: str) -> Loan:
    queryset = scope_loans(
        Loan.objects.select_related("customer", "branch", "product"), request.user
    )
    return get_object_or_404(queryset, number=number)


def _limit(user, operation: str) -> str | None:
    limit = authz.approval_limit(user, operation)
    if isinstance(limit, authz.NoLimit):
        return "0"
    return None if limit is None else str(limit)


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


class PaymentScreenView(APIView):
    """P33: «lo exigible hoy», quick amounts, payoff and where the money goes."""

    permission_classes = [CanCollect]

    def get(self, request: Request, number: str) -> Response:
        loan = _loan(request, number)
        user = request.user
        today = timezone.localdate()
        lines = portfolio.position(loan, today)
        summary = portfolio.summarize(lines, today)
        terms = portfolio.current_terms(loan)
        payload: dict = {
            "loan": {
                "id": str(loan.id),
                "number": loan.number,
                "status": loan.status,
                "customer_id": str(loan.customer_id),
                "customer_name": loan.customer.display_name,
                "customer_document": mask_document(loan.customer.document_number),
                "customer_phone": loan.customer.phone,
                "branch_name": loan.branch.name,
                "product_name": loan.product.name,
                "method": terms.method,
                "frequency": terms.frequency,
                "allocation_order": terms.allocation_order,
                "collector_name": person(loan.collector),
            },
            "as_of": today,
            "summary": {
                "overdue": _money(summary.overdue),
                "late_fee": _money(summary.late_fee),
                "current": _money(summary.current),
                "current_due_date": summary.current_due_date,
                "total_owed": _money(summary.total_owed),
                "principal": _money(summary.principal),
                "days_past_due": summary.days_past_due,
                "bucket": portfolio.bucket_of(summary.days_past_due),
            },
            "installments": [
                {
                    "id": str(line.installment.id),
                    "number": line.installment.number,
                    "due_date": line.installment.due_date,
                    "days_late": line.days_late,
                    "charges": _money(line.charges),
                    "late_fee": _money(line.late_fee),
                    "interest": _money(line.interest),
                    "principal": _money(line.principal),
                    "total": _money(line.total),
                    "status": line.installment.status,
                }
                for line in lines
                if line.total > 0
            ],
        }
        if loan.status == Loan.Status.ACTIVE:
            quote, valid_until = letters.compute(loan, today)
            payload["payoff"] = {
                "total": _money(quote.total),
                "principal": _money(quote.principal),
                "overdue_interest": _money(quote.overdue_interest),
                "current_interest": _money(quote.current_interest),
                "future_interest": _money(quote.future_interest),
                "late_fees": _money(quote.late_fees),
                "charges": _money(quote.charges),
                "interest_waived": _money(quote.interest_waived),
                "valid_until": valid_until,
            }
            try:
                plan_prepayment(lines, Decimal("0.01"), terms, today, "")
                payload["prepayment"] = {"allowed": True, "reason": None}
            except PaymentError as exc:
                payload["prepayment"] = {"allowed": False, "reason": str(exc)}
        route = cash.open_route_of(user)
        session = cash.open_session_of(user)
        payload["destination"] = (
            {"kind": "route", "label": "Tu ruta de hoy", "cash": _money(cash.route_cash(route))}
            if route
            else {
                "kind": "cash_session",
                "label": f"Caja {session.number}",
                "cash": _money(cash.expected_cash(session)),
                "stale": session.business_date < today,
            }
            if session
            else None
        )
        payload["limits"] = {
            "waive_late_fee": _limit(user, ApprovalLimit.Operation.WAIVE_LATE_FEE),
            "payoff_discount": _limit(user, ApprovalLimit.Operation.PAYOFF_DISCOUNT),
        }
        mine = ApprovalRequest.objects.filter(
            target_id=loan.id,
            requested_by=user,
            status__in=[ApprovalRequest.Status.PENDING, ApprovalRequest.Status.APPROVED],
            expires_at__gt=timezone.now(),
        ).select_related("decided_by", "reason")
        payload["approvals"] = ApprovalSerializer(
            mine, many=True, context={"request": request}
        ).data
        payload["bank_accounts"] = [
            {"id": str(account.id), "name": str(account)}
            for account in FinancialAccount.objects.filter(
                kind=FinancialAccount.Kind.BANK, is_active=True
            ).filter(Q(branch__isnull=True) | Q(branch_id=loan.branch_id))
        ]
        return Response(payload)


class _Rollback(Exception):
    def __init__(self, payload: dict) -> None:
        self.payload = payload


def _payment_kwargs(data: dict) -> dict:
    return {
        "amount": data["amount"],
        "method": data["method"],
        "kind": data["kind"],
        "received": data.get("received"),
        "reference": data.get("reference", ""),
        "bank_account": data.get("bank_account"),
        "waive": data.get("waive") or ZERO,
        "waive_note": data.get("waive_note", ""),
        "waiver_approval": data.get("waiver_approval"),
        "discount": data.get("discount") or ZERO,
        "discount_approval": data.get("discount_approval"),
        "prepayment_mode": data.get("prepayment_mode", ""),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
    }


class PaymentPreviewView(APIView):
    """F5 step 3: the breakdown and the balance after, before confirming.

    The payment runs for real inside a savepoint that is rolled back, so the
    preview can never disagree with what «Confirmar cobro» will do."""

    permission_classes = [CanCollect, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request, number: str) -> Response:
        loan = _loan(request, number)
        serializer = PaymentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                payment = post_payment(
                    loan=loan,
                    user=request.user,
                    idempotency_key=f"preview:{uuid.uuid4().hex}",
                    **_payment_kwargs(serializer.validated_data),
                )
                raise _Rollback(receipt_payload(payment))
        except _Rollback as done:
            return Response(done.payload)
        except PaymentError as exc:
            return fail(exc)


class CollectView(APIView):
    """F5 step 5 / P41: confirm the payment."""

    permission_classes = [CanCollect, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request, number: str) -> Response:
        loan = _loan(request, number)
        serializer = PaymentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not data.get("idempotency_key"):
            return Response(
                {"detail": "Falta la clave de idempotencia.", "code": "idempotency"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            payment = post_payment(
                loan=loan,
                user=request.user,
                idempotency_key=data["idempotency_key"],
                **_payment_kwargs(data),
            )
        except PaymentError as exc:
            return fail(exc)
        if payment.kind == Payment.Kind.PAYOFF:
            from apps.documents.services import issue_payoff_final

            user = request.user
            transaction.on_commit(lambda: issue_payoff_final(payment, issued_by=user), robust=True)
        return Response(
            {"number": payment.number, "id": str(payment.id)}, status=status.HTTP_201_CREATED
        )


class PaymentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """P34 and the payments tab: receipts by number, reversal and its link."""

    permission_classes = [CanSeeReceipts, CompanyNotSuspendedOrReadOnly]
    serializer_class = PaymentListSerializer
    lookup_field = "number"
    lookup_value_regex = r"[^/]+"

    def get_queryset(self):
        user = self.request.user
        queryset = Payment.objects.select_related(
            "loan", "customer", "collected_by", "branch", "cash_session"
        )
        from apps.customers.access import only_collector

        if only_collector(user):
            queryset = queryset.filter(Q(collected_by=user) | Q(loan__collector=user))
        else:
            queryset = queryset.filter(loan__in=scope_loans(Loan.objects.all(), user))
        params = self.request.query_params
        if params.get("loan"):
            queryset = queryset.filter(loan__number=params["loan"])
        if params.get("customer"):
            queryset = queryset.filter(customer_id=params["customer"])
        if params.get("cash_session"):
            queryset = queryset.filter(cash_session_id=params["cash_session"])
        if params.get("route_session"):
            queryset = queryset.filter(route_session_id=params["route_session"])
        if params.get("date"):
            queryset = queryset.filter(value_date=params["date"])
        return queryset.order_by("-paid_at")

    def retrieve(self, request: Request, number: str | None = None) -> Response:
        payment = get_object_or_404(self.get_queryset(), number=number)
        data = receipt_payload(payment)
        last = reversals.last_standing(payment.loan)
        data["can_request_reversal"] = (
            payment.status == Payment.Status.POSTED
            and payment.kind != Payment.Kind.MIGRATED
            and last is not None
            and last.pk == payment.pk
            and authz.has_any_role(request.user, *reversals.REQUEST_ROLES)
        )
        pending = (
            ApprovalRequest.objects.filter(
                target_id=payment.id,
                kind__in=reversals.REVERSAL_KINDS,
                status=ApprovalRequest.Status.PENDING,
            )
            .select_related("requested_by", "reason")
            .first()
        )
        data["pending_reversal"] = (
            ApprovalSerializer(pending, context={"request": request}).data if pending else None
        )
        return Response(data)

    @action(detail=True, methods=["get"], url_path="reverso/efecto")
    def reversal_effect(self, request: Request, number: str | None = None) -> Response:
        payment = get_object_or_404(self.get_queryset(), number=number)
        correct = request.query_params.get("correct_amount")
        try:
            effect = reversals.preview(
                payment, user=request.user, correct_amount=Decimal(correct) if correct else None
            )
        except PaymentError as exc:
            return fail(exc)
        return Response(
            {
                "installments": effect.installments,
                "cash_out": str(effect.cash_out),
                "cash_in": str(effect.cash_in),
                "principal_before": str(effect.principal_before),
                "principal_after": str(effect.principal_after),
            }
        )

    @action(detail=True, methods=["post"])
    def reverso(self, request: Request, number: str | None = None) -> Response:
        payment = get_object_or_404(self.get_queryset(), number=number)
        serializer = ReversalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            approval = reversals.request_reversal(
                payment=payment,
                user=request.user,
                reason=data["reason"],
                note=data["note"],
                correct_amount=data.get("correct_amount"),
            )
        except PaymentError as exc:
            return fail(exc)
        return Response(
            ApprovalSerializer(approval, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="enlace")
    def link(self, request: Request, number: str | None = None) -> Response:
        """Revoke the WhatsApp link, or issue a new one (decision 024)."""
        import secrets

        payment = get_object_or_404(self.get_queryset(), number=number)
        if not authz.has_any_role(request.user, G, SU, CA, CO):
            return fail(PaymentError("Tu rol no maneja enlaces de recibos.", "forbidden"))
        PublicLink.objects.filter(token=payment.receipt_token).update(revoked_at=timezone.now())
        if request.data.get("revoke"):
            payment.receipt_revoked_at = timezone.now()
        else:
            payment.receipt_token = secrets.token_urlsafe(24)
            payment.receipt_revoked_at = None
            PublicLink.objects.create(
                token=payment.receipt_token,
                tenant=payment.company_id,
                kind=PublicLink.Kind.RECEIPT,
                object_id=payment.id,
            )
        payment.save(update_fields=["receipt_token", "receipt_revoked_at", "updated_at"])
        return Response(receipt_payload(payment))


class PublicReceiptView(APIView):
    """The receipt behind the WhatsApp link: only that receipt, the document
    masked, nothing else reachable (F6 step 4)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_receipt"

    def get(self, request: Request, token: str) -> Response:
        link = PublicLink.objects.filter(
            token=token, kind=PublicLink.Kind.RECEIPT, revoked_at__isnull=True
        ).first()
        if link is None:
            return Response({"detail": "Este enlace no existe o fue revocado."}, status=404)
        with company_context(link.tenant):
            payment = get_object_or_404(
                Payment.objects.select_related("loan__product", "customer", "branch"),
                pk=link.object_id,
            )
            return Response(receipt_payload(payment, public=True))


class PayoffLetterView(APIView):
    """P36: compute on a date (GET) or issue the letter with its PDF (POST)."""

    permission_classes = [CanIssueLetters, CompanyNotSuspendedOrReadOnly]

    def _as_of(self, raw: str | None) -> dt.date:
        return dt.date.fromisoformat(raw) if raw else timezone.localdate()

    def get(self, request: Request, number: str) -> Response:
        loan = _loan(request, number)
        if loan.status != Loan.Status.ACTIVE:
            return fail(PaymentError("Solo un préstamo activo tiene saldo para saldar.", "state"))
        try:
            as_of = self._as_of(request.query_params.get("fecha"))
        except ValueError:
            return fail(PaymentError("Fecha inválida.", "as_of"))
        quote, valid_until = letters.compute(loan, as_of)
        return Response(
            {
                "as_of": as_of,
                "valid_until": valid_until,
                "total": str(quote.total),
                "principal": str(quote.principal),
                "overdue_interest": str(quote.overdue_interest),
                "current_interest": str(quote.current_interest),
                "future_interest": str(quote.future_interest),
                "late_fees": str(quote.late_fees),
                "charges": str(quote.charges),
                "interest_waived": str(quote.interest_waived),
            }
        )

    def post(self, request: Request, number: str) -> Response:
        loan = _loan(request, number)
        try:
            letter = letters.issue_quote(
                loan=loan, user=request.user, as_of=self._as_of(request.data.get("as_of"))
            )
        except (PaymentError, ValueError) as exc:
            return fail(exc)
        return Response(
            {"number": letter.number, "id": str(letter.id), "total": str(letter.total)},
            status=status.HTTP_201_CREATED,
        )


class PayoffLetterFileView(APIView):
    permission_classes = [CanIssueLetters]

    def get(self, request: Request, number: str, letter_id: str) -> Response:
        loan = _loan(request, number)
        letter = get_object_or_404(loan.payoff_quotes, pk=letter_id)
        document = GeneratedDocument.objects.filter(
            target_type="payments.payoffquote", target_id=letter.pk
        ).first()
        if document is None:
            from apps.documents.services import issue_payoff_letter

            document = issue_payoff_letter(letter, issued_by=request.user)
        SensitiveAccessLog.objects.create(
            company_id=loan.company_id,
            user=request.user,
            action=SensitiveAccessLog.Action.DOCUMENT,
            target_type="generated_document",
            target_id=document.id,
            detail=f"Carta de saldo {letter.number}",
        )
        return FileResponse(
            document.file.open("rb"),
            content_type="application/pdf",
            filename=f"{letter.number}.pdf",
        )


# --- P43: delinquency tray --------------------------------------------------------------------

BUCKET_RANGES = {
    "1_7": (1, 7),
    "8_30": (8, 30),
    "31_60": (31, 60),
    "61_90": (61, 90),
    "90_mas": (91, None),
}


class DelinquencyView(APIView):
    """Loans in arrears by bucket; the counts and totals always match the
    filters (F8 step 2). Days and late fees are the nightly figures, also
    refreshed by every payment."""

    permission_classes = [CanSeeDelinquency]

    def get(self, request: Request) -> Response:
        today = timezone.localdate()
        overdue = (
            Installment.objects.filter(loan=OuterRef("pk"), due_date__lt=today)
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
        money_field = DecimalField(max_digits=14, decimal_places=2)
        base = scope_loans(
            Loan.objects.filter(status=Loan.Status.ACTIVE, days_past_due__gt=0), request.user
        )
        params = request.query_params
        if params.get("branch"):
            base = base.filter(branch_id=params["branch"])
        if params.get("collector"):
            base = base.filter(collector_id=params["collector"])
        # Phase 5: the agent's tray and the loans with or without a promise.
        agent = params.get("gestor")
        if agent:
            agent_id = request.user.pk if agent == "mios" else agent
            base = base.filter(Q(agent_id=agent_id) | Q(agent__isnull=True, collector_id=agent_id))
        pending = PaymentPromise.objects.filter(
            loan=OuterRef("pk"), status=PaymentPromise.Status.PENDING
        )
        if params.get("promesa") == "con":
            base = base.filter(Exists(pending))
        elif params.get("promesa") == "sin":
            base = base.exclude(Exists(pending))
        for word in params.get("q", "").split():
            base = base.filter(
                Q(number__icontains=word)
                | Q(customer__first_name__unaccent__icontains=word)
                | Q(customer__last_name__unaccent__icontains=word)
                | Q(customer__legal_name__unaccent__icontains=word)
            )
        buckets = []
        for key, (low, high) in BUCKET_RANGES.items():
            in_bucket = base.filter(days_past_due__gte=low)
            if high is not None:
                in_bucket = in_bucket.filter(days_past_due__lte=high)
            totals = in_bucket.aggregate(
                count=Count("id"),
                principal=Coalesce(
                    Sum("principal_outstanding"), Value(ZERO), output_field=money_field
                ),
            )
            buckets.append(
                {"key": key, "count": totals["count"], "principal": str(totals["principal"])}
            )
        selected = params.get("tramo") or "1_7"
        low, high = BUCKET_RANGES.get(selected, BUCKET_RANGES["1_7"])
        rows = base.filter(days_past_due__gte=low)
        if high is not None:
            rows = rows.filter(days_past_due__lte=high)
        last_action = CollectionAction.objects.filter(loan=OuterRef("pk")).order_by("-created_at")
        rows = (
            rows.select_related("customer", "collector", "agent", "branch")
            .annotate(
                overdue=Coalesce(Subquery(overdue, output_field=money_field), Value(ZERO)),
                promise_on=Subquery(pending.values("promised_on")[:1]),
                promise_amount=Subquery(pending.values("amount")[:1]),
                last_action_at=Subquery(last_action.values("created_at")[:1]),
                last_action_result=Subquery(last_action.values("result")[:1]),
            )
            .order_by("-days_past_due", "number")
        )
        page = rows[:200]
        return Response(
            {
                "buckets": buckets,
                "selected": selected,
                "totals": {
                    "count": rows.count(),
                    "principal": str(rows.aggregate(t=Sum("principal_outstanding"))["t"] or ZERO),
                },
                "results": [
                    {
                        "number": loan.number,
                        "customer_id": str(loan.customer_id),
                        "customer_name": loan.customer.display_name,
                        "customer_phone": loan.customer.phone,
                        "branch_name": loan.branch.name,
                        "collector_name": person(loan.collector),
                        "agent_name": person(loan.agent or loan.collector),
                        "promise": None
                        if loan.promise_on is None
                        else {"on": loan.promise_on, "amount": str(loan.promise_amount)},
                        "last_action": None
                        if loan.last_action_at is None
                        else {
                            "at": loan.last_action_at,
                            "result": CollectionAction.Result(loan.last_action_result).label,
                        },
                        "days_past_due": loan.days_past_due,
                        "overdue": str(loan.overdue + loan.late_fee_outstanding),
                        "late_fee": str(loan.late_fee_outstanding),
                        "principal_outstanding": str(loan.principal_outstanding),
                        "next_due_date": loan.next_due_date,
                        "last_payment_on": loan.last_payment_on,
                    }
                    for loan in page
                ],
            }
        )


# --- P11: authorizations ------------------------------------------------------------------------


class ApprovalViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Pending for me to decide, and what I asked for."""

    serializer_class = ApprovalSerializer
    permission_classes = [CompanyNotSuspendedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        queryset = ApprovalRequest.objects.select_related("requested_by", "decided_by", "reason")
        box = self.request.query_params.get("bandeja", "por_decidir")
        if box == "mias":
            return queryset.filter(requested_by=user).order_by("-created_at")[:100]
        candidates = queryset.filter(
            status=ApprovalRequest.Status.PENDING, expires_at__gt=timezone.now()
        ).exclude(requested_by=user)
        return [
            item for item in candidates.order_by("created_at") if reversals.can_decide(user, item)
        ]

    def create(self, request: Request) -> Response:
        serializer = AuthorizationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        loan = _loan(request, data["loan"])
        try:
            approval = reversals.request_authorization(
                loan=loan,
                user=request.user,
                kind=data["kind"],
                amount=data["amount"],
                note=data["note"],
            )
        except PaymentError as exc:
            return fail(exc)
        return Response(
            ApprovalSerializer(approval, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def _decide(self, request: Request, pk: str, approve: bool) -> Response:
        approval = get_object_or_404(ApprovalRequest, pk=pk)
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Doc 06 - 6: authorizing a reversal asks for the second factor again.
        if (
            approve
            and approval.kind in reversals.REVERSAL_KINDS
            and not confirm_identity(request.user, data["second_factor"])
        ):
            return Response(
                {"detail": "El código de verificación no es válido.", "code": "second_factor"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            approval = reversals.decide(
                request=approval, user=request.user, approve=approve, note=data["note"]
            )
        except PaymentError as exc:
            return fail(exc)
        return Response(ApprovalSerializer(approval, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def aprobar(self, request: Request, pk: str | None = None) -> Response:
        return self._decide(request, pk, approve=True)

    @action(detail=True, methods=["post"])
    def rechazar(self, request: Request, pk: str | None = None) -> Response:
        return self._decide(request, pk, approve=False)

    @action(detail=True, methods=["post"])
    def cancelar(self, request: Request, pk: str | None = None) -> Response:
        approval = get_object_or_404(ApprovalRequest, pk=pk)
        try:
            approval = reversals.cancel(request=approval, user=request.user)
        except PaymentError as exc:
            return fail(exc)
        return Response(ApprovalSerializer(approval, context={"request": request}).data)
