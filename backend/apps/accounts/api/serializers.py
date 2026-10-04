from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.accounts.models import Invitation, Role
from apps.core.models import Branch


class InvitationCreateSerializer(serializers.Serializer):
    """RLS scopes the branch and role querysets to the inviter's company."""

    email = serializers.EmailField()
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    role = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all())


class InvitationDetailSerializer(serializers.ModelSerializer):
    company_name = serializers.SerializerMethodField()
    role_name = serializers.CharField(source="role.name")
    branch_name = serializers.CharField(source="branch.name")
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = ["email", "company_name", "role_name", "branch_name", "expires_at", "is_expired"]

    def get_company_name(self, obj: Invitation) -> str:
        return str(obj.company)

    def get_is_expired(self, obj: Invitation) -> bool:
        from django.utils import timezone

        return obj.expires_at <= timezone.now()


class InvitationAcceptSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value
