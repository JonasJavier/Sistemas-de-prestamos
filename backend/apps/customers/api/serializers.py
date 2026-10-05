from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core.models import Branch, Municipality, Province, Sector
from apps.customers.files import inspect_private_file
from apps.customers.models import (
    Business,
    Collateral,
    CollateralFile,
    Customer,
    CustomerFile,
    Employment,
    PropertyDetail,
    Reference,
    Relative,
    VehicleDetail,
)
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


class _CompanyFromCustomerMixin:
    """Create-time company assignment for records hanging off a customer."""

    def create(self, validated_data: dict[str, Any]):  # type: ignore[override]
        validated_data["company_id"] = self.context["request"].user.company_id
        return super().create(validated_data)  # type: ignore[misc]


class EmploymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employment
        fields = [
            "employer",
            "position",
            "since",
            "monthly_salary",
            "employer_phone",
            "employer_address",
        ]


class BusinessSerializer(serializers.ModelSerializer):
    class Meta:
        model = Business
        fields = ["name", "activity", "address", "since", "monthly_sales", "monthly_expenses"]


class RelativeSerializer(_CompanyFromCustomerMixin, serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())

    class Meta:
        model = Relative
        fields = ["id", "customer", "name", "relationship", "phone", "address"]


class ReferenceSerializer(_CompanyFromCustomerMixin, serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    verified_by_email = serializers.CharField(source="verified_by.email", read_only=True)

    class Meta:
        model = Reference
        fields = [
            "id",
            "customer",
            "name",
            "phone",
            "relationship",
            "verified_by_email",
            "verified_at",
            "verification_result",
        ]
        read_only_fields = ["verified_at", "verification_result"]


class ReferenceVerifySerializer(serializers.Serializer):
    result = serializers.CharField(max_length=300)


class CustomerFileSerializer(_CompanyFromCustomerMixin, serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    file = serializers.FileField(write_only=True)
    uploaded_by_email = serializers.CharField(source="uploaded_by.email", read_only=True)

    class Meta:
        model = CustomerFile
        fields = [
            "id",
            "customer",
            "kind",
            "file",
            "content_type",
            "size",
            "sha256",
            "uploaded_by_email",
            "created_at",
        ]
        read_only_fields = ["content_type", "size", "sha256", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        try:
            content_type, size, sha256 = inspect_private_file(attrs["file"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"file": exc.messages[0]}) from exc
        attrs.update(content_type=content_type, size=size, sha256=sha256)
        return attrs

    def create(self, validated_data: dict[str, Any]) -> CustomerFile:
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)


class CollateralFileSerializer(_CompanyFromCustomerMixin, serializers.ModelSerializer):
    collateral = serializers.PrimaryKeyRelatedField(queryset=Collateral.objects.all())
    file = serializers.FileField(write_only=True)
    uploaded_by_email = serializers.CharField(source="uploaded_by.email", read_only=True)

    class Meta:
        model = CollateralFile
        fields = [
            "id",
            "collateral",
            "kind",
            "file",
            "content_type",
            "size",
            "sha256",
            "uploaded_by_email",
            "created_at",
        ]
        read_only_fields = ["content_type", "size", "sha256", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        try:
            content_type, size, sha256 = inspect_private_file(attrs["file"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"file": exc.messages[0]}) from exc
        attrs.update(content_type=content_type, size=size, sha256=sha256)
        return attrs

    def create(self, validated_data: dict[str, Any]) -> CollateralFile:
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)


class VehicleDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleDetail
        fields = ["brand", "model", "year", "color", "plate", "chassis", "registration"]


class PropertyDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyDetail
        fields = ["title_number", "cadastral_designation", "location", "area_m2"]


class CollateralSerializer(_CompanyFromCustomerMixin, serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    owner_name = serializers.CharField(source="owner.display_name", read_only=True)
    vehicle = VehicleDetailSerializer(required=False, allow_null=True)
    property = PropertyDetailSerializer(required=False, allow_null=True)

    class Meta:
        model = Collateral
        fields = [
            "id",
            "owner",
            "owner_name",
            "type",
            "description",
            "status",
            "appraised_value",
            "currency",
            "appraised_at",
            "appraiser",
            "vehicle",
            "property",
        ]
        read_only_fields = ["status"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        collateral_type = attrs.get("type", getattr(self.instance, "type", None))
        if collateral_type == Collateral.Type.VEHICLE and not (
            attrs.get("vehicle") or getattr(self.instance, "vehicle", None)
        ):
            raise serializers.ValidationError(
                {"vehicle": "Un vehículo necesita marca y modelo (defecto #16 de la referencia)."}
            )
        if collateral_type == Collateral.Type.PROPERTY and not (
            attrs.get("property") or getattr(self.instance, "property", None)
        ):
            raise serializers.ValidationError(
                {"property": "Un inmueble necesita sus datos de título o ubicación."}
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Collateral:
        vehicle_data = validated_data.pop("vehicle", None)
        property_data = validated_data.pop("property", None)
        company_id = self.context["request"].user.company_id
        validated_data["company_id"] = company_id
        collateral = Collateral.objects.create(**validated_data)
        if vehicle_data:
            VehicleDetail.objects.create(
                company_id=company_id, collateral=collateral, **vehicle_data
            )
        if property_data:
            PropertyDetail.objects.create(
                company_id=company_id, collateral=collateral, **property_data
            )
        return collateral

    def update(self, instance: Collateral, validated_data: dict[str, Any]) -> Collateral:
        vehicle_data = validated_data.pop("vehicle", None)
        property_data = validated_data.pop("property", None)
        collateral = super().update(instance, validated_data)
        if vehicle_data:
            VehicleDetail.objects.update_or_create(
                collateral=collateral,
                defaults={**vehicle_data, "company_id": collateral.company_id},
            )
        if property_data:
            PropertyDetail.objects.update_or_create(
                collateral=collateral,
                defaults={**property_data, "company_id": collateral.company_id},
            )
        return collateral
