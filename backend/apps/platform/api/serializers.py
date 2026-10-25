from typing import Any

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.core.models import Company
from apps.platform.models import Plan, Subscription, SubscriptionPayment


class RegistrationSerializer(serializers.Serializer):
    """Public signup payload: the company plus its first administrator (F19)."""

    company_legal_name = serializers.CharField(max_length=200)
    company_trade_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )
    rnc = serializers.CharField(max_length=11, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    accept_terms = serializers.BooleanField(default=False)

    def validate_accept_terms(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "Para crear la cuenta acepta los términos de servicio y el aviso de privacidad."
            )
        return value

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
            "tier",
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = ["id", "plan", "status", "started_on", "paid_until"]


class PlanWriteSerializer(serializers.ModelSerializer):
    """PT3 (decision 122): the owner edits the plans. One active trial plan
    at a time: the signup takes it."""

    companies = serializers.IntegerField(read_only=True)

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
            "is_active",
            "tier",
            "companies",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        current = self.instance
        is_trial = attrs.get("is_trial", current.is_trial if current else False)
        is_active = attrs.get("is_active", current.is_active if current else True)
        others = Plan.objects.filter(is_trial=True, is_active=True)
        if current is not None:
            others = others.exclude(pk=current.pk)
        if is_trial and is_active and others.exists():
            raise serializers.ValidationError(
                {"is_trial": "Ya hay un plan de prueba activo; desactívalo primero."}
            )
        if current is not None and current.is_trial and current.is_active:
            if not (is_trial and is_active):
                raise serializers.ValidationError(
                    {"is_trial": "Las empresas nuevas necesitan un plan de prueba activo."}
                )
        return attrs


class CompanySerializer(serializers.ModelSerializer):
    """What the platform owner sees: lifecycle data, never business data (046)."""

    subscription = SubscriptionSerializer(read_only=True)
    users_count = serializers.IntegerField(read_only=True, default=0)
    trial_days_left = serializers.SerializerMethodField()

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
            "trial_days_left",
            "created_at",
            "users_count",
            "subscription",
        ]

    def get_trial_days_left(self, company: Company) -> int | None:
        from django.utils import timezone

        if company.trial_ends_on is None:
            return None
        return max((company.trial_ends_on - timezone.localdate()).days, 0)


class SubscriptionPaymentSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source="recorded_by.email", read_only=True)

    class Meta:
        model = SubscriptionPayment
        fields = [
            "id",
            "period_start",
            "period_end",
            "amount",
            "currency",
            "method",
            "reference",
            "recorded_by",
            "created_at",
        ]


class CompanyDetailSerializer(CompanySerializer):
    """The company's file (PT1, decision 122): the data, the plan against
    its use, its managers (to help them in) and what was paid."""

    usage = serializers.SerializerMethodField()
    managers = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    support = serializers.SerializerMethodField()

    class Meta(CompanySerializer.Meta):
        fields = [
            *CompanySerializer.Meta.fields,
            "address",
            "terms_version",
            "terms_accepted_at",
            "usage",
            "managers",
            "payments",
            "support",
        ]

    def get_usage(self, company: Company) -> dict:
        from apps.core.tenancy import company_context
        from apps.platform import limits

        with company_context(company.id):
            used = limits.usage(company.id)
        plan = company.subscription.plan if hasattr(company, "subscription") else None
        return {
            key: {"used": used[key], "limit": getattr(plan, field) if plan else None}
            for key, (field, _label) in limits.LIMITS.items()
        }

    def get_managers(self, company: Company) -> list[dict]:
        from allauth.account.models import EmailAddress
        from allauth.mfa.models import Authenticator

        from apps.platform.api.views import _managers_of

        users = _managers_of(company)
        ids = [u.pk for u in users]
        with_mfa = set(
            Authenticator.objects.filter(
                user_id__in=ids, type__in=[Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN]
            ).values_list("user_id", flat=True)
        )
        verified = set(
            EmailAddress.objects.filter(user_id__in=ids, verified=True).values_list(
                "user_id", flat=True
            )
        )
        return [
            {
                "id": str(u.pk),
                "name": u.get_full_name() or u.email,
                "email": u.email,
                "is_active": u.is_active,
                "last_login": u.last_login,
                "mfa_enabled": u.pk in with_mfa,
                "email_verified": u.pk in verified,
            }
            for u in users
        ]

    def get_payments(self, company: Company) -> list[dict]:
        rows = SubscriptionPayment.objects.filter(subscription__company=company).order_by(
            "-period_end", "-created_at"
        )[:12]
        return SubscriptionPaymentSerializer(rows, many=True).data

    def get_support(self, company: Company) -> dict | None:
        from apps.platform import support

        grant = next(
            (
                g
                for g in company.support_grants.filter(revoked_at__isnull=True).order_by(
                    "-starts_at"
                )
                if support.is_active(g)
            ),
            None,
        )
        if grant is None:
            return None
        return {"id": str(grant.id), "ends_at": grant.ends_at, "reason": grant.reason}


class StatusChangeSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class TrialExtensionSerializer(serializers.Serializer):
    """Decision 122: up to 90 more days of trial, with a reason."""

    days = serializers.IntegerField(min_value=1, max_value=90)
    reason = serializers.CharField(max_length=300)


class PlanChangeSerializer(serializers.Serializer):
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.filter(is_active=True))


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
