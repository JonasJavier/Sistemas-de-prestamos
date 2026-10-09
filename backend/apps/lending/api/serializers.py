from typing import Any

from rest_framework import serializers

from apps.lending.models import LateFeePolicy, LoanProduct, ProductCharge
from engine.rates import Frequency
from engine.schedule import INTEREST_ONLY_METHODS, Method


class LateFeePolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = LateFeePolicy
        fields = ["grace_days", "fee_method", "monthly_rate", "fixed_amount", "cap_pct"]


class ProductChargeSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(queryset=LoanProduct.objects.all())

    class Meta:
        model = ProductCharge
        fields = ["id", "product", "name", "basis", "value", "mode", "taxed", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> ProductCharge:
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)


class LoanProductSerializer(serializers.ModelSerializer):
    late_fee_policy = LateFeePolicySerializer()
    charges = ProductChargeSerializer(many=True, read_only=True)

    class Meta:
        model = LoanProduct
        fields = [
            "id",
            "name",
            "type",
            "method",
            "allowed_frequencies",
            "rate_unit",
            "min_amount",
            "max_amount",
            "min_rate",
            "max_rate",
            "default_rate",
            "min_term",
            "max_term",
            "payment_rounding",
            "collect_saturdays",
            "collect_sundays",
            "collect_holidays",
            "allocation_order",
            "payoff_full_current_period",
            "payoff_future_interest_pct",
            "guarantee",
            "min_coverage",
            "required_documents",
            "is_active",
            "late_fee_policy",
            "charges",
        ]

    def validate_allowed_frequencies(self, value: list[str]) -> list[str]:
        valid = {f.value for f in Frequency}
        if not value:
            raise serializers.ValidationError("Permite al menos una frecuencia.")
        unknown = set(value) - valid
        if unknown:
            raise serializers.ValidationError(f"Frecuencias inválidas: {sorted(unknown)}.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        def pair(low: str, high: str, label: str) -> None:
            lo = attrs.get(low, getattr(self.instance, low, None))
            hi = attrs.get(high, getattr(self.instance, high, None))
            if lo is not None and hi is not None and lo > hi:
                raise serializers.ValidationError({low: f"El mínimo de {label} supera al máximo."})

        pair("min_amount", "max_amount", "monto")
        pair("min_rate", "max_rate", "tasa")
        pair("min_term", "max_term", "plazo")
        method = attrs.get("method", getattr(self.instance, "method", None))
        rounding = attrs.get("payment_rounding", getattr(self.instance, "payment_rounding", None))
        if method in INTEREST_ONLY_METHODS and rounding not in (None, LoanProduct.Rounding.CENT):
            raise serializers.ValidationError(
                {
                    "payment_rounding": "En los métodos de solo interés la cuota es el "
                    "interés: se cobra al centavo."
                }
            )
        default_rate = attrs.get("default_rate", getattr(self.instance, "default_rate", None))
        low = attrs.get("min_rate", getattr(self.instance, "min_rate", None))
        high = attrs.get("max_rate", getattr(self.instance, "max_rate", None))
        if default_rate is not None and low is not None and high is not None:
            if not low <= default_rate <= high:
                raise serializers.ValidationError(
                    {"default_rate": "La tasa por defecto debe estar dentro del rango."}
                )
        return attrs

    def validate_method(self, value: str) -> str:
        return Method(value).value

    def validate_required_documents(self, value: list) -> list[str]:
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise serializers.ValidationError("Envía una lista de nombres de documentos.")
        cleaned = [v.strip() for v in value if v.strip()]
        if len(set(cleaned)) != len(cleaned):
            raise serializers.ValidationError("Hay documentos repetidos.")
        return cleaned

    def create(self, validated_data: dict[str, Any]) -> LoanProduct:
        policy_data = validated_data.pop("late_fee_policy")
        company_id = self.context["request"].user.company_id
        validated_data["company_id"] = company_id
        product = LoanProduct.objects.create(**validated_data)
        LateFeePolicy.objects.create(company_id=company_id, product=product, **policy_data)
        return product

    def update(self, instance: LoanProduct, validated_data: dict[str, Any]) -> LoanProduct:
        policy_data = validated_data.pop("late_fee_policy", None)
        product = super().update(instance, validated_data)
        if policy_data:
            policy, _ = LateFeePolicy.objects.update_or_create(
                product=product,
                defaults={**policy_data, "company_id": product.company_id},
            )
            product.late_fee_policy = policy  # refresh the cached relation
        return product


class SimulationRequestSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=LoanProduct.objects.filter(is_active=True)
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    installments = serializers.IntegerField(min_value=1)
    frequency = serializers.CharField()
    rate = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    first_due = serializers.DateField(required=False, allow_null=True)
