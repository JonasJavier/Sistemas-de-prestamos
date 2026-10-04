from typing import Any

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.core.models import Company
from apps.platform.models import Plan, Subscription


class RegistrationSerializer(serializers.Serializer):
    """Public signup payload: the company plus its first administrator (F19)."""

    company_legal_name = serializers.CharField(max_length=200)
    company_trade_name = serializers.CharField(max_length=200, required=False, default="")
    rnc = serializers.CharField(max_length=11, required=False, default="")
    phone = serializers.CharField(max_length=30, required=False, default="")
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate_email(self, value: str) -> str:
        from apps.accounts.models import User

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Ya existe una cuenta con este correo.")
        return value


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "id",
            "name",
            "monthly_price",
            "currency",
            "max_users",
            "max_branches",
            "max_active_loans",
            "is_trial",
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = ["id", "plan", "status", "started_on", "paid_until"]


class CompanySerializer(serializers.ModelSerializer):
    """What the platform owner sees: lifecycle data, never business data (046)."""

    subscription = SubscriptionSerializer(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "legal_name",
            "trade_name",
            "rnc",
            "phone",
            "email",
            "status",
            "status_reason",
            "trial_ends_on",
            "created_at",
            "subscription",
        ]


class StatusChangeSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class PaymentRecordSerializer(serializers.Serializer):
    """Manual subscription payment (decision 045: no gateway yet)."""

    period_start = serializers.DateField()
    period_end = serializers.DateField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    method = serializers.ChoiceField(choices=["transfer", "deposit", "other"])
    reference = serializers.CharField(max_length=100, required=False, default="")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["period_end"] <= attrs["period_start"]:
            raise serializers.ValidationError("El período pagado debe terminar después de empezar.")
        return attrs


class MyCompanySerializer(serializers.ModelSerializer):
    """What a company sees about itself in Ajustes - Suscripción (P83)."""

    subscription = SubscriptionSerializer(read_only=True)

    def to_representation(self, instance: Company) -> dict[str, Any]:
        data = super().to_representation(instance)
        return data

    class Meta:
        model = Company
        fields = [
            "id",
            "legal_name",
            "trade_name",
            "rnc",
            "status",
            "status_reason",
            "trial_ends_on",
            "subscription",
        ]
