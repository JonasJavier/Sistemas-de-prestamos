from typing import Any

from rest_framework import serializers

from apps.core.models import Branch


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "code", "name", "address", "phone", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_code(self, value: str) -> str:
        # Decision 030: the code prefixes document numbers and never changes.
        if self.instance is not None and value != self.instance.code:
            raise serializers.ValidationError("El código de la sucursal no se puede cambiar.")
        return value

    def create(self, validated_data: dict[str, Any]) -> Branch:
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)
