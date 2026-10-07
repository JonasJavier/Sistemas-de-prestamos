from typing import Any

from rest_framework import serializers

from apps.core.models import Branch, Holiday, Reason, Sequence


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

    def validate_is_active(self, value: bool) -> bool:
        # A company always keeps one open branch: users, numbering and cash live there.
        if (
            self.instance is not None
            and self.instance.is_active
            and not value
            and not Branch.objects.filter(is_active=True).exclude(pk=self.instance.pk).exists()
        ):
            raise serializers.ValidationError(
                "Es la única sucursal activa: crea otra antes de desactivar esta."
            )
        return value

    def create(self, validated_data: dict[str, Any]) -> Branch:
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)


class ReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reason
        fields = ["id", "kind", "text", "is_active"]
        read_only_fields = ["id"]

    def create(self, validated_data: dict[str, Any]) -> Reason:
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ["id", "date", "name", "is_confirmed"]
        read_only_fields = ["id"]

    def validate_date(self, value):
        company_id = self.context["request"].user.company_id
        clash = Holiday.objects.filter(company_id=company_id, date=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("Ya hay un feriado en esa fecha.")
        return value

    def create(self, validated_data: dict[str, Any]) -> Holiday:
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)


class SequenceSerializer(serializers.ModelSerializer):
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    doc_type_label = serializers.CharField(source="get_doc_type_display", read_only=True)
    next_number = serializers.SerializerMethodField()

    class Meta:
        model = Sequence
        fields = [
            "id",
            "branch",
            "branch_code",
            "doc_type",
            "doc_type_label",
            "prefix",
            "next_value",
            "padding",
            "next_number",
        ]
        read_only_fields = ["id", "branch", "doc_type", "next_value", "padding"]

    def get_next_number(self, obj: Sequence) -> str:
        return f"{obj.prefix}{obj.next_value:0{obj.padding}d}"

    def validate_prefix(self, value: str) -> str:
        # Numbers are unique per company and type: two branches sharing a
        # prefix would collide (decision 030). Only future numbers change.
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El prefijo no puede quedar vacío.")
        clash = Sequence.objects.filter(doc_type=self.instance.doc_type, prefix=value).exclude(
            pk=self.instance.pk
        )
        if clash.exists():
            raise serializers.ValidationError(
                "Otra sucursal ya usa ese prefijo para este documento."
            )
        return value
