"""Users. Email login, one company per user; the platform owner has none.

Memberships, roles and approval limits (doc 05 - section 4.2) arrive later
in phase 1; this is the minimum needed to boot auth and the admin.
"""

import uuid
from typing import Any

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
