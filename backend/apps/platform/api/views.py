"""The owner's panel (PT1–PT3, decisions 045, 091 and 122) and the public
signup (F19). Lifecycle data only: never a customer, a loan or an amount of
a company. Every action the owner takes on a company is written in that
company's own audit trail, so the company sees it too."""

import datetime as dt

from allauth.account.models import EmailAddress
from django.conf import settings
from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts import services as account_services
from apps.accounts.models import Membership, User
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.platform import limits, services, support, tasks
from apps.platform.api.permissions import IsPlatformAdmin
from apps.platform.api.serializers import (
    CompanyDetailSerializer,
    CompanySerializer,
    MyCompanySerializer,
    PaymentRecordSerializer,
    PlanChangeSerializer,
    PlanWriteSerializer,
    RegistrationSerializer,
    StatusChangeSerializer,
    SubscriptionPaymentSerializer,
    TrialExtensionSerializer,
)
from apps.platform.models import Plan, Subscription, SubscriptionPayment


class RegistrationView(APIView):
    """Public company signup (F19). Heavily throttled; email must be verified."""

    permission_classes = [AllowAny]
    authentication_classes: list[type] = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registration"

    def post(self, request: Request) -> Response:
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = services.register_company(
            legal_name=data["company_legal_name"],
            trade_name=data["company_trade_name"],
            rnc=data["rnc"],
            phone=data["phone"],
            admin_email=data["email"],
            admin_password=data["password"],
            admin_first_name=data["first_name"],
            admin_last_name=data["last_name"],
            terms_version=settings.LEGAL_TERMS_VERSION,
        )
        address = EmailAddress.objects.add_email(
            request, result.admin, result.admin.email, confirm=True, signup=True
        )
        address.set_as_primary()
        transaction.on_commit(
            lambda: tasks.notify_owner_of_signup(result.company, result.admin.email)
        )
        return Response(
            {
                "company_id": str(result.company.id),
                "trial_ends_on": result.company.trial_ends_on,
                "detail": "Revisa tu correo para confirmar la cuenta.",
            },
            status=status.HTTP_201_CREATED,
        )


def _note(company: Company, *, actor: User, type: str, summary: str, data: dict | None = None):  # noqa: A002
    """Decision 122: what the owner does to a company goes in its audit trail."""
    from apps.audit.models import record_event

    with company_context(company.id):
        record_event(
            company_id=company.id,
            type=type,
            target=company,
            actor=actor,
            summary=summary[:300],
            data=data or {},
        )


def _managers_of(company: Company) -> list[User]:
    """The company's managers and administrators: the only people of a
    company the owner may act on (decision 122)."""
    with company_context(company.id):
        memberships = (
            Membership.objects.filter(role__name__in=[authz.GERENTE, authz.ADMINISTRADOR])
            .select_related("user")
            .order_by("user__email")
        )
        return list({m.user_id: m.user for m in memberships}.values())


class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    """The owner's company panel (PT1): lifecycle only, no business data (046)."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = CompanySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["legal_name", "trade_name", "rnc", "email"]
    ordering_fields = ["created_at", "legal_name", "trial_ends_on"]
    ordering = ["-created_at"]

    def get_queryset(self):
        active_users = (
            User.objects.filter(company=OuterRef("pk"), is_active=True)
            .order_by()
            .values("company")
            .annotate(n=Count("id"))
            .values("n")
        )
        return (
            Company.objects.select_related("subscription__plan")
            .annotate(users_count=Coalesce(Subquery(active_users), 0))
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        return CompanyDetailSerializer if self.action == "retrieve" else CompanySerializer

    def _answer(self, company: Company) -> Response:
        company = self.get_queryset().get(pk=company.pk)
        return Response(CompanyDetailSerializer(company).data)

    @action(detail=True, methods=["post"])
    def suspend(self, request: Request, pk: str | None = None) -> Response:
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = self.get_object()
        company.status = Company.Status.SUSPENDED
        company.status_reason = serializer.validated_data["reason"]
        company.save(update_fields=["status", "status_reason", "updated_at"])
        _note(
            company,
            actor=request.user,
            type="platform.suspended",
            summary=f"Cobradía suspendió la empresa: {company.status_reason}",
        )
        return self._answer(company)

    @action(detail=True, methods=["post"])
    def reactivate(self, request: Request, pk: str | None = None) -> Response:
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = self.get_object()
        # Back to the trial if it still has days left, else active (a paid
        # period or the owner's own call).
        today = timezone.localdate()
        in_trial = company.trial_ends_on is not None and company.trial_ends_on >= today
        paid = (
            company.subscription.paid_until is not None and company.subscription.paid_until >= today
        )
        company.status = Company.Status.TRIAL if in_trial and not paid else Company.Status.ACTIVE
        company.status_reason = serializer.validated_data["reason"]
        company.save(update_fields=["status", "status_reason", "updated_at"])
        subscription = company.subscription
        subscription.status = (
            Subscription.Status.TRIAL
            if company.status == Company.Status.TRIAL
            else Subscription.Status.ACTIVE
        )
        subscription.save(update_fields=["status", "updated_at"])
        _note(
            company,
            actor=request.user,
            type="platform.reactivated",
            summary=f"Cobradía reactivó la empresa: {company.status_reason}",
        )
        return self._answer(company)

    @action(detail=True, methods=["post"], url_path="cerrar")
    def close(self, request: Request, pk: str | None = None) -> Response:
        """F19 step 6: the company asked to leave (or never came back)."""
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = self.get_object()
        company.status = Company.Status.CLOSED
        company.status_reason = serializer.validated_data["reason"]
        company.save(update_fields=["status", "status_reason", "updated_at"])
        Subscription.objects.filter(company=company).update(status=Subscription.Status.CANCELED)
        for grant in company.support_grants.filter(revoked_at__isnull=True):
            if support.is_active(grant):
                grant.revoked_at = timezone.now()
                grant.save(update_fields=["revoked_at", "updated_at"])
        _note(
            company,
            actor=request.user,
            type="platform.closed",
            summary=f"Cobradía cerró la empresa: {company.status_reason}",
        )
        return self._answer(company)

    @action(detail=True, methods=["post"], url_path="registrar-pago")
    def record_payment(self, request: Request, pk: str | None = None) -> Response:
        """F19 step 4: a recorded payment activates the company."""
        serializer = PaymentRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        company = self.get_object()
        subscription = company.subscription
        SubscriptionPayment.objects.create(
            subscription=subscription,
            period_start=data["period_start"],
            period_end=data["period_end"],
            amount=data["amount"],
            method=data["method"],
            reference=data["reference"],
            recorded_by=request.user,
        )
        subscription.status = Subscription.Status.ACTIVE
        subscription.paid_until = max(
            subscription.paid_until or data["period_end"], data["period_end"]
        )
        subscription.save(update_fields=["status", "paid_until", "updated_at"])
        company.status = Company.Status.ACTIVE
        company.status_reason = ""
        company.save(update_fields=["status", "status_reason", "updated_at"])
        _note(
            company,
            actor=request.user,
            type="platform.payment",
            summary=(
                f"Cobradía registró un pago de RD$ {data['amount']:,.2f} "
                f"({data['period_start']:%d/%m/%Y} al {data['period_end']:%d/%m/%Y})"
            ),
            data={"amount": str(data["amount"]), "reference": data["reference"]},
        )
        return self._answer(company)

    @action(detail=True, methods=["get"], url_path="pagos")
    def payments(self, request: Request, pk: str | None = None) -> Response:
        company = self.get_object()
        rows = SubscriptionPayment.objects.filter(subscription__company=company).order_by(
            "-period_end", "-created_at"
        )[:60]
        return Response(SubscriptionPaymentSerializer(rows, many=True).data)

    @action(detail=True, methods=["post"], url_path="extender-prueba")
    def extend_trial(self, request: Request, pk: str | None = None) -> Response:
        """Decision 122: more days of trial, also to a company whose trial
        ran out and was suspended for it."""
        serializer = TrialExtensionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        company = self.get_object()
        if company.status == Company.Status.CLOSED:
            raise ValidationError({"detail": "Esa empresa está cerrada."})
        today = timezone.localdate()
        base = max(company.trial_ends_on or today, today)
        company.trial_ends_on = base + dt.timedelta(days=data["days"])
        company.trial_warned_on = None
        if company.status == Company.Status.SUSPENDED:
            company.status = Company.Status.TRIAL
            company.status_reason = ""
            Subscription.objects.filter(company=company).update(status=Subscription.Status.TRIAL)
        company.save(
            update_fields=[
                "trial_ends_on",
                "trial_warned_on",
                "status",
                "status_reason",
                "updated_at",
            ]
        )
        _note(
            company,
            actor=request.user,
            type="platform.trial_extended",
            summary=(
                f"Cobradía extendió la prueba {data['days']} días, hasta el "
                f"{company.trial_ends_on:%d/%m/%Y}: {data['reason']}"
            ),
            data={"days": data["days"]},
        )
        return self._answer(company)

    @action(detail=True, methods=["post"], url_path="cambiar-plan")
    def change_plan(self, request: Request, pk: str | None = None) -> Response:
        serializer = PlanChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = self.get_object()
        plan = serializer.validated_data["plan"]
        subscription = company.subscription
        before = subscription.plan.name
        subscription.plan = plan
        subscription.save(update_fields=["plan", "updated_at"])
        _note(
            company,
            actor=request.user,
            type="platform.plan_changed",
            summary=f"Cobradía cambió el plan de «{before}» a «{plan.name}»",
            data={"from": before, "to": plan.name},
        )
        return self._answer(company)

    def _manager(self, company: Company, user_id: str) -> User:
        user = next((u for u in _managers_of(company) if str(u.pk) == user_id), None)
        if user is None:
            raise ValidationError(
                {"detail": "Solo los gerentes y administradores de la empresa aparecen aquí."}
            )
        return user

    @action(detail=True, methods=["post"], url_path=r"usuarios/(?P<user_id>[^/.]+)/restablecer-2fa")
    def reset_manager_mfa(
        self, request: Request, pk: str | None = None, user_id: str = ""
    ) -> Response:
        """Decision 120: the lone administrator who lost the phone and the
        codes is let back in by Cobradía, after checking who they are."""
        company = self.get_object()
        user = self._manager(company, user_id)
        account_services.reset_two_factor(
            user=user, by=request.user, note=str(request.data.get("note", ""))
        )
        return self._answer(company)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"usuarios/(?P<user_id>[^/.]+)/reenviar-confirmacion",
    )
    def resend_verification(
        self, request: Request, pk: str | None = None, user_id: str = ""
    ) -> Response:
        """The confirmation e-mail never arrived: send it again."""
        company = self.get_object()
        user = self._manager(company, user_id)
        address = EmailAddress.objects.filter(user=user, email__iexact=user.email).first()
        if address is None:
            address = EmailAddress.objects.create(user=user, email=user.email, primary=True)
        if address.verified:
            raise ValidationError({"detail": "Ese correo ya está confirmado."})
        address.send_confirmation(request, signup=False)
        _note(
            company,
            actor=request.user,
            type="platform.verification_resent",
            summary=f"Cobradía reenvió la confirmación del correo a {user.email}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlanViewSet(viewsets.ModelViewSet):
    """PT3 (decision 122): the owner keeps the plans and their caps."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = PlanWriteSerializer
    pagination_class = None
    queryset = Plan.objects.annotate(
        companies=Count(
            "subscriptions",
            filter=~Q(subscriptions__company__status=Company.Status.CLOSED),
        )
    ).order_by("-is_trial", "monthly_price", "name")

    def perform_destroy(self, instance: Plan) -> None:
        if instance.subscriptions.exists():
            raise ValidationError(
                {"detail": "Ese plan tiene empresas: desactívalo en lugar de borrarlo."}
            )
        instance.delete()


class PublicPlansView(APIView):
    """Decision 124: the plans on offer, for the subscription screen and the
    site. Public: prices are public."""

    permission_classes = [AllowAny]
    authentication_classes: list[type] = []

    def get(self, request: Request) -> Response:
        from apps.platform import features

        rows = Plan.objects.filter(is_active=True, is_trial=False).order_by("monthly_price")
        return Response(
            [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "tier": plan.tier,
                    "monthly_price": str(plan.monthly_price),
                    "max_users": plan.max_users,
                    "max_branches": plan.max_branches,
                    "max_active_loans": plan.max_active_loans,
                    "features": sorted(features.features_of_tier(plan.tier)),
                }
                for plan in rows
            ]
        )


class MyCompanyView(APIView):
    """A tenant reads its own company and subscription (P83)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        company_id = getattr(request.user, "company_id", None)
        if company_id is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        company = Company.objects.select_related("subscription__plan").get(pk=company_id)
        data = MyCompanySerializer(company).data
        # Decision 104: what the plan allows and what is in use.
        data["usage"] = limits.usage(company.id)
        if company.trial_ends_on:
            data["trial_days_left"] = max((company.trial_ends_on - timezone.localdate()).days, 0)
        return Response(data)
