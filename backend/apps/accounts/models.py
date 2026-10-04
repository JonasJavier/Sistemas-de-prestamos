"""Users. Email login, one company per user; the platform owner has none.

Memberships, roles and approval limits (doc 05 - section 4.2) arrive later
in phase 1; this is the minimum needed to boot auth and the admin.
"""

import uuid
from typing import Any

import pghistory
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models import Q


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields: Any) -> User:
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields: Any) -> User:
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> User:
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_platform_admin", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self._create_user(email, password, **extra_fields)


@pghistory.track(exclude=["password", "last_login"])
class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    username = None  # type: ignore[assignment]
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=30, blank=True)
    company = models.ForeignKey(
        "core.Company",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="users",
    )
    is_platform_admin = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()  # type: ignore[misc]

    class Meta:
        constraints = [
            # The platform owner belongs to no tenant; everyone else must.
            models.CheckConstraint(
                condition=Q(is_platform_admin=True, company__isnull=True)
                | Q(is_platform_admin=False, company__isnull=False)
                | Q(is_platform_admin=False, is_superuser=True),
                name="user_company_matches_platform_role",
            ),
        ]

    def __str__(self) -> str:
        return self.email


@pghistory.track()
class Role(models.Model):
    """A permission template within one company (doc 06 - section 2).

    The eight system roles are seeded at signup; companies can add their
    own. Fine-grained permissions land with the permission matrix work.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.CASCADE, related_name="roles")
    name = models.CharField(max_length=80)
    is_system = models.BooleanField(default=False)
    permissions = models.ManyToManyField("auth.Permission", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="role_unique_per_company"),
        ]

    def __str__(self) -> str:
        return self.name


@pghistory.track()
class Membership(models.Model):
    """A user's role at one branch; users may hold several (doc 05 - section 4.2)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.CASCADE, related_name="+")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    branch = models.ForeignKey("core.Branch", on_delete=models.CASCADE, related_name="memberships")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="memberships")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "branch", "role"], name="membership_unique"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.branch}: {self.role}"


@pghistory.track()
class ApprovalLimit(models.Model):
    """How much a role (or a specific user) may approve per operation (doc 06 - section 5)."""

    class Operation(models.TextChoices):
        APPROVE_APPLICATION = "approve_application", "Aprobar solicitud"
        WAIVE_LATE_FEE = "waive_late_fee", "Condonar mora"
        PAYOFF_DISCOUNT = "payoff_discount", "Descuento en liquidación"
        AUTHORIZE_REVERSAL = "authorize_reversal", "Autorizar reverso"
        EXPENSE = "expense", "Gasto"
        CASH_DIFFERENCE = "cash_difference", "Diferencia de caja"

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.CASCADE, related_name="+")
    role = models.ForeignKey(
        Role, null=True, blank=True, on_delete=models.CASCADE, related_name="approval_limits"
    )
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.CASCADE, related_name="approval_limits"
    )
    operation = models.CharField(max_length=30, choices=Operation)
    max_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="DOP")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # Exactly one holder: a role or a specific user.
            models.CheckConstraint(
                condition=(
                    Q(role__isnull=False, user__isnull=True)
                    | Q(role__isnull=True, user__isnull=False)
                ),
                name="approval_limit_role_xor_user",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.operation} <= {self.max_amount}"


@pghistory.track(exclude=["token"])
class Invitation(models.Model):
    """Admin invites a user by email; nobody sets another person's password (F17)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.CASCADE, related_name="+")
    email = models.EmailField()
    branch = models.ForeignKey("core.Branch", on_delete=models.CASCADE, related_name="+")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="+")
    token = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"
