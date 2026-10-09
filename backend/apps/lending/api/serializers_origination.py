"""Serializers for applications (F3) and loans (F4). Money travels as strings."""

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.audit.models import DomainEvent
from apps.core.models import Reason
from apps.customers.files import inspect_private_file
from apps.customers.models import Collateral, Customer
from apps.customers.validators import mask_document
from apps.ledger.models import FinancialAccount
from apps.lending.models import (
    FREQUENCY_CHOICES,
    Application,
    ApplicationBudgetItem,
    ApplicationCollateral,
    ApplicationFile,
    ApplicationGuarantor,
    ApplicationRequirement,
    Disbursement,
    Installment,
    Loan,
    LoanCharge,
    LoanFile,
    LoanProduct,
    LoanTerms,
)


def _person(user) -> str | None:
    if user is None:
        return None
    return user.get_full_name() or user.email


class ApplicationListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    customer_document = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    assigned_approver_name = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "number",
            "status",
            "customer",
            "customer_name",
            "customer_document",
            "product",
            "product_name",
            "amount",
            "approved_amount",
            "frequency",
            "installments",
            "created_by",
            "created_by_name",
            "assigned_approver_name",
            "submitted_at",
            "valid_until",
            "created_at",
        ]

    def get_customer_document(self, obj: Application) -> str:
        return mask_document(obj.customer.document_number)

    def get_created_by_name(self, obj: Application) -> str | None:
        return _person(obj.created_by)

    def get_assigned_approver_name(self, obj: Application) -> str | None:
        return _person(obj.assigned_approver)


class ApplicationSerializer(serializers.ModelSerializer):
    """Create/edit the requested conditions; the rest flows through actions."""

    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    product = serializers.PrimaryKeyRelatedField(
        queryset=LoanProduct.objects.filter(is_active=True)
    )
    frequency = serializers.ChoiceField(choices=FREQUENCY_CHOICES)
    rate = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    customer_status = serializers.CharField(source="customer.status", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    assigned_approver_name = serializers.SerializerMethodField()
    decided_by_name = serializers.SerializerMethodField()
    decision_reason_text = serializers.CharField(
        source="decision_reason.text", read_only=True, default=None
    )
    loan_number = serializers.SerializerMethodField()
    # F11 (decision 092): the loan this application renews.
    renews_number = serializers.CharField(source="renews.number", read_only=True, default=None)

    class Meta:
        model = Application
        fields = [
            "id",
            "number",
            "status",
            "branch",
            "branch_code",
            "customer",
            "customer_name",
            "customer_status",
            "product",
            "product_name",
            "currency",
            "amount",
            "frequency",
            "installments",
            "rate",
            "rate_unit",
            "first_due",
            "purpose",
            "notes",
            "renews_number",
            "created_by",
            "created_by_name",
            "submitted_at",
            "assigned_approver",
            "assigned_approver_name",
            "decided_by",
            "decided_by_name",
            "decided_at",
            "decision_reason",
            "decision_reason_text",
            "decision_note",
            "approved_amount",
            "approved_installments",
            "approved_rate",
            "approved_frequency",
            "approved_first_due",
            "valid_until",
            "capacity_ratio",
            "bureau_provider",
            "bureau_score",
            "bureau_date",
            "loan_number",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "number",
            "status",
            "branch",
            "currency",
            "rate_unit",
            "created_by",
            "submitted_at",
            "assigned_approver",
            "decided_by",
            "decided_at",
            "decision_reason",
            "decision_note",
            "approved_amount",
            "approved_installments",
            "approved_rate",
            "approved_frequency",
            "approved_first_due",
            "valid_until",
            "capacity_ratio",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj: Application) -> str | None:
        return _person(obj.created_by)

    def get_assigned_approver_name(self, obj: Application) -> str | None:
        return _person(obj.assigned_approver)

    def get_decided_by_name(self, obj: Application) -> str | None:
        return _person(obj.decided_by)

    def get_loan_number(self, obj: Application) -> str | None:
        loan = getattr(obj, "loan", None)
        return loan.number if loan else None


class ApproveSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, min_value=Decimal("0.01")
    )
    installments = serializers.IntegerField(required=False, min_value=1)
    frequency = serializers.ChoiceField(choices=FREQUENCY_CHOICES, required=False)
    rate = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    first_due = serializers.DateField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class RejectSerializer(serializers.Serializer):
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.REJECTION, is_active=True)
    )
    note = serializers.CharField(max_length=2000)


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class _ApplicationChildSerializer(serializers.ModelSerializer):
    application = serializers.PrimaryKeyRelatedField(queryset=Application.objects.all())

    def validate_application(self, application: Application) -> Application:
        if application.status not in Application.EDITABLE:
            raise serializers.ValidationError(
                "Solo se modifican borradores y solicitudes devueltas."
            )
        return application

    def create(self, validated_data: dict[str, Any]):
        validated_data["company_id"] = validated_data["application"].company_id
        return super().create(validated_data)


class BudgetItemSerializer(_ApplicationChildSerializer):
    class Meta:
        model = ApplicationBudgetItem
        fields = ["id", "application", "kind", "category", "description", "monthly_amount"]


class GuarantorSerializer(_ApplicationChildSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    customer_document = serializers.SerializerMethodField()
    customer_status = serializers.CharField(source="customer.status", read_only=True)

    class Meta:
        model = ApplicationGuarantor
        fields = [
            "id",
            "application",
            "customer",
            "customer_name",
            "customer_document",
            "customer_status",
        ]

    def get_customer_document(self, obj: ApplicationGuarantor) -> str:
        return mask_document(obj.customer.document_number)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Only customers of our own base (RLS) and never the borrower (#27).
        if attrs["customer"].pk == attrs["application"].customer_id:
            raise serializers.ValidationError(
                {"customer": "El deudor no puede ser su propio garante."}
            )
        if attrs["customer"].kind != Customer.Kind.PERSON:
            raise serializers.ValidationError({"customer": "El garante debe ser una persona."})
        return attrs


class ApplicationCollateralSerializer(_ApplicationChildSerializer):
    collateral = serializers.PrimaryKeyRelatedField(queryset=Collateral.objects.all())
    considered_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, min_value=Decimal("0")
    )
    description = serializers.CharField(source="collateral.description", read_only=True)
    type = serializers.CharField(source="collateral.type", read_only=True)
    status = serializers.CharField(source="collateral.status", read_only=True)
    appraised_value = serializers.DecimalField(
        source="collateral.appraised_value", max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = ApplicationCollateral
        fields = [
            "id",
            "application",
            "collateral",
            "considered_value",
            "description",
            "type",
            "status",
            "appraised_value",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        collateral: Collateral = attrs["collateral"]
        if collateral.status not in (Collateral.Status.REGISTERED, Collateral.Status.RELEASED):
            raise serializers.ValidationError(
                {"collateral": "Ese bien ya respalda otro préstamo o fue ejecutado."}
            )
        if attrs.get("considered_value") is None:
            if collateral.appraised_value is None:
                raise serializers.ValidationError(
                    {"considered_value": "El bien no tiene tasación: indica el valor considerado."}
                )
            attrs["considered_value"] = collateral.appraised_value
        return attrs


class ApplicationFileSerializer(serializers.ModelSerializer):
    application = serializers.PrimaryKeyRelatedField(queryset=Application.objects.all())
    file = serializers.FileField(write_only=True)
    uploaded_by_email = serializers.CharField(source="uploaded_by.email", read_only=True)

    class Meta:
        model = ApplicationFile
        fields = [
            "id",
            "application",
            "kind",
            "description",
            "file",
            "content_type",
            "size",
            "sha256",
            "uploaded_by_email",
            "created_at",
        ]
        read_only_fields = ["content_type", "size", "sha256", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        try:
            content_type, size, sha256 = inspect_private_file(attrs["file"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"file": exc.messages[0]}) from exc
        attrs.update(content_type=content_type, size=size, sha256=sha256)
        return attrs

    def create(self, validated_data: dict[str, Any]) -> ApplicationFile:
        validated_data["company_id"] = validated_data["application"].company_id
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)


class RequirementSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ApplicationRequirement
        fields = ["id", "application", "name", "file", "verified_by_name", "verified_at"]
        read_only_fields = fields

    def get_verified_by_name(self, obj: ApplicationRequirement) -> str | None:
        return _person(obj.verified_by)


class VerifyRequirementSerializer(serializers.Serializer):
    file = serializers.PrimaryKeyRelatedField(
        queryset=ApplicationFile.objects.all(), required=False, allow_null=True
    )


class EventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = DomainEvent
        fields = ["id", "type", "summary", "data", "actor_name", "created_at"]

    def get_actor_name(self, obj: DomainEvent) -> str | None:
        return _person(obj.actor)


class DisburseSerializer(serializers.Serializer):
    # Cash always leaves the cashier's open drawer (decision 055, phase 4).
    source_account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True), required=False, allow_null=True
    )
    charge_account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True), required=False, allow_null=True
    )
    method = serializers.ChoiceField(choices=Disbursement.Method.choices)
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True)
    idempotency_key = serializers.CharField(min_length=8, max_length=64)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["method"] == Disbursement.Method.CASH:
            attrs["source_account"] = None
            return attrs
        source = attrs.get("source_account")
        if source is None or source.kind != FinancialAccount.Kind.BANK:
            raise serializers.ValidationError(
                {"source_account": "La transferencia o el cheque salen de una cuenta bancaria."}
            )
        return attrs


# --- Loans -----------------------------------------------------------------------


class LoanListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    customer_document = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)

    class Meta:
        model = Loan
        fields = [
            "id",
            "number",
            "status",
            "customer",
            "customer_name",
            "customer_document",
            "product_name",
            "branch_code",
            "principal",
            "principal_outstanding",
            "interest_outstanding",
            "days_past_due",
            "next_due_date",
            "disbursed_on",
        ]

    def get_customer_document(self, obj: Loan) -> str:
        return mask_document(obj.customer.document_number)


class TermsSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LoanTerms
        exclude = ["company", "loan", "created_by", "approved_by"]

    def get_created_by_name(self, obj: LoanTerms) -> str | None:
        return _person(obj.created_by)

    def get_approved_by_name(self, obj: LoanTerms) -> str | None:
        return _person(obj.approved_by)


class InstallmentSerializer(serializers.ModelSerializer):
    version = serializers.IntegerField(source="terms.version", read_only=True)
    total_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Installment
        exclude = ["company", "loan", "terms", "created_at", "updated_at"]


class LoanChargeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanCharge
        fields = ["id", "name", "basis", "value", "mode", "amount", "status"]


class DisbursementSerializer(serializers.ModelSerializer):
    source_account_name = serializers.CharField(source="source_account.__str__", read_only=True)
    disbursed_by_name = serializers.SerializerMethodField()
    entry_number = serializers.CharField(source="journal_entry.number", read_only=True)

    class Meta:
        model = Disbursement
        fields = [
            "disbursed_on",
            "source_account_name",
            "method",
            "reference",
            "gross",
            "discounted_charges",
            "financed_charges",
            "cash_charges",
            "net",
            "renewal_payoff",
            "disbursed_by_name",
            "entry_number",
            "created_at",
        ]

    def get_disbursed_by_name(self, obj: Disbursement) -> str | None:
        return _person(obj.disbursed_by)


class LoanSerializer(LoanListSerializer):
    application_number = serializers.CharField(
        source="application.number", read_only=True, default=None
    )
    officer_name = serializers.SerializerMethodField()
    current_terms = serializers.SerializerMethodField()
    charges = LoanChargeSerializer(many=True, read_only=True)
    disbursement = DisbursementSerializer(read_only=True)
    guarantors = serializers.SerializerMethodField()
    collaterals = serializers.SerializerMethodField()
    void_reason_text = serializers.CharField(
        source="void_reason.text", read_only=True, default=None
    )
    collector_name = serializers.SerializerMethodField()
    closed_on = serializers.DateField(read_only=True)
    # F11 (decision 092): the renewal chain, both ways.
    renewed_from_number = serializers.CharField(
        source="renewed_from.number", read_only=True, default=None
    )
    renewed_by_number = serializers.SerializerMethodField()

    class Meta(LoanListSerializer.Meta):
        fields = [
            *LoanListSerializer.Meta.fields,
            "collector",
            "collector_name",
            "closed_on",
            "application",
            "application_number",
            "currency",
            "officer_name",
            "late_fee_outstanding",
            "last_payment_on",
            "is_restructured",
            "is_migrated",
            "voided_on",
            "written_off_on",
            "void_reason_text",
            "void_note",
            "promissory_note_signed_at",
            "current_terms",
            "charges",
            "disbursement",
            "guarantors",
            "collaterals",
            "renewed_from_number",
            "renewed_by_number",
        ]

    def get_renewed_by_number(self, obj: Loan) -> str | None:
        return (
            obj.renewals.exclude(status=Loan.Status.VOIDED).values_list("number", flat=True).first()
        )

    def get_officer_name(self, obj: Loan) -> str | None:
        return _person(obj.officer)

    def get_collector_name(self, obj: Loan) -> str | None:
        return _person(obj.collector)

    def get_current_terms(self, obj: Loan) -> dict | None:
        terms = obj.terms.order_by("-version").first()
        return TermsSerializer(terms).data if terms else None

    def get_guarantors(self, obj: Loan) -> list[dict]:
        return [
            {
                "id": str(g.customer_id),
                "name": g.customer.display_name,
                "document": mask_document(g.customer.document_number),
            }
            for g in obj.guarantors.select_related("customer")
        ]

    def get_collaterals(self, obj: Loan) -> list[dict]:
        return [
            {
                "id": str(c.collateral_id),
                "description": c.collateral.description,
                "type": c.collateral.type,
                "status": c.collateral.status,
                "considered_value": str(c.considered_value),
            }
            for c in obj.collaterals.select_related("collateral")
        ]


class DateChangeSerializer(serializers.Serializer):
    first_due = serializers.DateField()
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.DATE_CHANGE, is_active=True)
    )
    note = serializers.CharField(max_length=1000)


class VoidSerializer(serializers.Serializer):
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.VOID, is_active=True)
    )
    note = serializers.CharField(max_length=2000)


class LoanFileSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = LoanFile
        fields = ["id", "kind", "file", "content_type", "size", "sha256", "created_at"]
        read_only_fields = ["content_type", "size", "sha256", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        try:
            content_type, size, sha256 = inspect_private_file(attrs["file"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"file": exc.messages[0]}) from exc
        attrs.update(content_type=content_type, size=size, sha256=sha256)
        return attrs
