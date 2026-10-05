from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core.models import Branch, Municipality, Province, Sector
from apps.customers.models import Customer
from apps.customers.validators import clean_document, validate_cedula, validate_rnc


class CustomerListSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    branch_code = serializers.CharField(source="home_branch.code", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "kind",
            "document_type",
            "document_number",
            "display_name",
            "phone",
            "status",
            "branch_code",
            "created_at",
        ]


class CustomerSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    home_branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True)  # RLS scopes it to the company
    )
    province = serializers.PrimaryKeyRelatedField(
        queryset=Province.objects.all(), required=False, allow_null=True
    )
    municipality = serializers.PrimaryKeyRelatedField(
        queryset=Municipality.objects.all(), required=False, allow_null=True
    )
    sector = serializers.PrimaryKeyRelatedField(
        queryset=Sector.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "kind",
            "document_type",
            "document_number",
            "first_name",
            "last_name",
            "birth_date",
            "gender",
            "marital_status",
            "occupation",
            "legal_name",
            "legal_representative",
            "phone",
            "phone2",
            "email",
            "address_line",
            "province",
            "municipality",
            "sector",
            "home_branch",
            "officer",
            "status",
            "block_reason",
            "consent_at",
            "display_name",
            "created_at",
        ]
        read_only_fields = ["id", "status", "block_reason", "display_name", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = self.instance
        kind = attrs.get("kind", getattr(instance, "kind", None))
        doc_type = attrs.get("document_type", getattr(instance, "document_type", None))
        number = attrs.get("document_number", getattr(instance, "document_number", None))

        # Normalize and check the document (F1 step 2).
        if number is not None:
            try:
                if doc_type == Customer.DocumentType.CEDULA:
                    number = validate_cedula(number)
                elif doc_type == Customer.DocumentType.RNC:
                    number = validate_rnc(number)
                else:
                    number = clean_document(number)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {"document_number": exc.messages[0]}
                ) from exc
            attrs["document_number"] = number

        # Kind coherence.
        if kind == Customer.Kind.PERSON:
            first = attrs.get("first_name", getattr(instance, "first_name", ""))
            last = attrs.get("last_name", getattr(instance, "last_name", ""))
            if not first or not last:
                raise serializers.ValidationError(
                    {"first_name": "Una persona necesita nombre y apellido."}
                )
            if doc_type == Customer.DocumentType.RNC:
                raise serializers.ValidationError(
                    {"document_type": "Una persona no puede usar RNC."}
                )
        elif kind == Customer.Kind.COMPANY:
            legal = attrs.get("legal_name", getattr(instance, "legal_name", ""))
            if not legal:
                raise serializers.ValidationError(
                    {"legal_name": "Una empresa necesita su razón social."}
                )

        # Geography coherence.
        municipality = attrs.get("municipality")
        province = attrs.get("province")
        if municipality and province and municipality.province_id != province.id:
            raise serializers.ValidationError(
                {"municipality": "El municipio no pertenece a esa provincia."}
            )
        sector = attrs.get("sector")
        if sector and municipality and sector.municipality_id != municipality.id:
            raise serializers.ValidationError(
                {"sector": "El sector no pertenece a ese municipio."}
            )

        # Exact duplicate blocks the creation (F1 step 1).
        duplicates = Customer.objects.filter(
            document_type=doc_type, document_number=number
        )
        if instance is not None:
            duplicates = duplicates.exclude(pk=instance.pk)
        if number and duplicates.exists():
            raise serializers.ValidationError(
                {"document_number": "Ya existe un cliente con este documento."}
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Customer:
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)


class BlockSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)
