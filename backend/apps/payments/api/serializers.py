"""Payments API: the payment request, the receipt and the authorizations."""

from decimal import Decimal

from rest_framework import serializers

from apps.core.api.errors import person
from apps.core.models import ApprovalRequest, Company, Reason
from apps.customers.validators import mask_document
from apps.ledger.models import FinancialAccount
from apps.payments.models import Payment

ZERO = Decimal("0.00")
COMPONENTS = ("charges", "late_fee", "interest", "principal")


class PaymentRequestSerializer(serializers.Serializer):
    """F5 step 3: amount, method and, when needed, waiver and authorizations."""

    kind = serializers.ChoiceField(
        choices=[Payment.Kind.REGULAR, Payment.Kind.PAYOFF, Payment.Kind.PREPAYMENT],
        default=Payment.Kind.REGULAR,
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    received = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(kind=FinancialAccount.Kind.BANK, is_active=True),
        required=False,
        allow_null=True,
    )
    waive = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=ZERO, min_value=ZERO
    )
    waive_note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    waiver_approval = serializers.PrimaryKeyRelatedField(
        queryset=ApprovalRequest.objects.all(), required=False, allow_null=True
    )
    discount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, default=ZERO, min_value=ZERO
    )
    discount_approval = serializers.PrimaryKeyRelatedField(
        queryset=ApprovalRequest.objects.all(), required=False, allow_null=True
    )
    prepayment_mode = serializers.ChoiceField(
        choices=["reduce_term", "reduce_payment"], required=False, allow_blank=True, default=""
    )
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    idempotency_key = serializers.CharField(min_length=8, max_length=64, required=False)


def receipt_lines(payment: Payment) -> tuple[list[dict], dict]:
    """The breakdown by installment and component, and its totals (doc 09)."""
    rows: dict = {}
    for allocation in payment.allocations.select_related("installment").order_by(
        "installment__due_date", "installment__number"
    ):
        inst = allocation.installment
        row = rows.setdefault(
            inst.id,
            {
                "number": inst.number,
                "due_date": inst.due_date,
                **{component: ZERO for component in COMPONENTS},
            },
        )
        row[allocation.component] += allocation.amount
    lines = []
    totals = {component: ZERO for component in COMPONENTS}
    for row in rows.values():
        row["total"] = sum((row[c] for c in COMPONENTS), ZERO)
        for component in COMPONENTS:
            totals[component] += row[component]
        lines.append({k: str(v) if isinstance(v, Decimal) else v for k, v in row.items()})
    return lines, {k: str(v) for k, v in totals.items()}


def receipt_payload(payment: Payment, *, public: bool = False) -> dict:
    """What the receipt shows (P34), on paper, thermal and the WhatsApp link."""
    lines, totals = receipt_lines(payment)
    company = Company.objects.get(pk=payment.company_id)
    loan = payment.loan
    customer = payment.customer
    reversal = getattr(payment, "reversal", None)
    replaces = getattr(payment, "replaces", None)
    data = {
        "number": payment.number,
        "status": payment.status,
        "kind": payment.kind,
        "kind_label": payment.get_kind_display(),
        "paid_at": payment.paid_at,
        "value_date": payment.value_date,
        "method": payment.method,
        "method_label": payment.get_method_display(),
        "reference": payment.reference,
        "received": str(payment.received),
        "change": str(payment.change),
        "amount": str(payment.amount),
        "late_fee_waived": str(payment.late_fee_waived),
        "interest_waived": str(payment.interest_waived),
        "discount": str(payment.discount),
        "principal_after": str(payment.principal_after),
        "owed_after": str(payment.owed_after),
        "currency": payment.currency,
        "company": {
            "name": company.legal_name,
            "trade_name": company.trade_name,
            "rnc": company.rnc,
            "phone": payment.branch.phone or company.phone,
            "email": company.email,
        },
        "branch": {"name": payment.branch.name, "address": payment.branch.address},
        "loan": {"number": loan.number, "product": loan.product.name},
        "customer": {
            "name": customer.display_name,
            "document": mask_document(customer.document_number),
            "phone": "" if public else customer.phone,
        },
        "collected_by": (payment.collected_by.first_name or "")
        if public
        else person(payment.collected_by),
        "lines": lines,
        "totals": totals,
        "reversed": None
        if reversal is None
        else {
            "on": reversal.reversed_on,
            "reason": reversal.reason.text,
            "replacement": reversal.replacement.number if reversal.replacement_id else None,
        },
        "replaces": replaces.payment.number if replaces is not None else None,
    }
    if not public:
        data.update(
            {
                "id": str(payment.id),
                "loan_status": loan.status,
                "cash_session": payment.cash_session.number if payment.cash_session_id else None,
                "route": payment.route_session_id is not None,
                "off_route": payment.off_route,
                "receipt_path": None
                if payment.receipt_revoked_at
                else f"/r/{payment.receipt_token}",
                "reversal_note": reversal.note if reversal else None,
                "reversal_authorized_by": person(reversal.authorized_by) if reversal else None,
            }
        )
    return data


class PaymentListSerializer(serializers.ModelSerializer):
    loan_number = serializers.CharField(source="loan.number", read_only=True)
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    collected_by_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "number",
            "loan_number",
            "customer_name",
            "kind",
            "kind_label",
            "status",
            "paid_at",
            "value_date",
            "method",
            "method_label",
            "amount",
            "collected_by_name",
            "off_route",
        ]

    def get_collected_by_name(self, obj: Payment) -> str | None:
        return person(obj.collected_by)


class ReversalRequestSerializer(serializers.Serializer):
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.REVERSAL, is_active=True)
    )
    note = serializers.CharField(max_length=1000)
    correct_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )


class ApprovalSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    decided_by_name = serializers.SerializerMethodField()
    reason_text = serializers.CharField(source="reason.text", read_only=True, default=None)
    can_decide = serializers.SerializerMethodField()
    needs_second_factor = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
        fields = [
            "id",
            "kind",
            "kind_label",
            "status",
            "status_label",
            "target_type",
            "target_label",
            "amount",
            "reason_text",
            "note",
            "payload",
            "requested_by_name",
            "decided_by_name",
            "decided_at",
            "decision_note",
            "expires_at",
            "created_at",
            "can_decide",
            "needs_second_factor",
        ]

    def get_requested_by_name(self, obj: ApprovalRequest) -> str | None:
        return person(obj.requested_by)

    def get_decided_by_name(self, obj: ApprovalRequest) -> str | None:
        return person(obj.decided_by)

    def get_can_decide(self, obj: ApprovalRequest) -> bool:
        from apps.payments.reversals import can_decide

        request = self.context.get("request")
        return bool(
            request
            and obj.status == ApprovalRequest.Status.PENDING
            and can_decide(request.user, obj)
        )

    def get_needs_second_factor(self, obj: ApprovalRequest) -> bool:
        from apps.payments.reversals import REVERSAL_KINDS

        return obj.kind in REVERSAL_KINDS


class AuthorizationRequestSerializer(serializers.Serializer):
    loan = serializers.CharField(max_length=30)  # the loan number
    kind = serializers.ChoiceField(
        choices=[ApprovalRequest.Kind.WAIVE_LATE_FEE, ApprovalRequest.Kind.PAYOFF_DISCOUNT]
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    note = serializers.CharField(max_length=1000)


class DecisionSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    second_factor = serializers.CharField(
        max_length=128, required=False, allow_blank=True, default=""
    )
