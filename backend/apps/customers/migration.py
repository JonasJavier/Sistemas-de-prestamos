"""F16 (decision 107): the customers of the previous system, through the
same validation as the customer form (document check digits, kinds,
contact data). A document already on file is skipped, so a corrected file
can be loaded again."""

from types import SimpleNamespace

from django.core.exceptions import ValidationError as DjangoValidationError

from apps.core.models import Branch
from apps.customers.api.serializers import CustomerSerializer
from apps.customers.models import Customer
from apps.customers.validators import clean_document, validate_cedula, validate_rnc

# Spanish column → (field, required, help for the template).
COLUMNS = {
    "tipo": ("kind", True, "persona o empresa"),
    "tipo_documento": ("document_type", True, "cedula, rnc o pasaporte"),
    "documento": ("document_number", True, "con o sin guiones"),
    "nombres": ("first_name", False, "personas"),
    "apellidos": ("last_name", False, "personas"),
    "razon_social": ("legal_name", False, "empresas"),
    "representante": ("legal_representative", False, "empresas"),
    "fecha_nacimiento": ("birth_date", False, "AAAA-MM-DD"),
    "genero": ("gender", False, "f o m"),
    "ocupacion": ("occupation", False, ""),
    "telefono": ("phone", False, "10 dígitos"),
    "telefono2": ("phone2", False, ""),
    "correo": ("email", False, "para el portal y los avisos"),
    "direccion": ("address_line", False, ""),
    "sucursal": ("home_branch", True, "código de la sucursal, p. ej. 01"),
}
KINDS = {"persona": Customer.Kind.PERSON, "empresa": Customer.Kind.COMPANY}
DOCUMENTS = {
    "cedula": Customer.DocumentType.CEDULA,
    "rnc": Customer.DocumentType.RNC,
    "pasaporte": Customer.DocumentType.PASSPORT,
}


class CustomerRowError(Exception):
    pass


def _payload(raw: dict[str, str], branches: dict[str, Branch]) -> dict:
    data = {}
    for column, (field, required, _help) in COLUMNS.items():
        value = raw.get(column, "")
        if required and not value:
            raise CustomerRowError(f"Falta «{column}».")
        if value:
            data[field] = value
    kind = KINDS.get(data["kind"].lower())
    document_type = DOCUMENTS.get(data["document_type"].lower().replace("é", "e"))
    if kind is None:
        raise CustomerRowError(f"«tipo» debe ser persona o empresa, no «{data['kind']}».")
    if document_type is None:
        raise CustomerRowError("«tipo_documento» debe ser cedula, rnc o pasaporte.")
    branch = branches.get(data["home_branch"].upper())
    if branch is None:
        raise CustomerRowError(f"No hay una sucursal activa con el código «{data['home_branch']}».")
    data.update(kind=kind, document_type=document_type, home_branch=str(branch.pk))
    if "gender" in data:
        data["gender"] = data["gender"].lower()[:1]
    return data


def _normalized(document_type: str, number: str) -> str:
    try:
        if document_type == Customer.DocumentType.CEDULA:
            return validate_cedula(number)
        if document_type == Customer.DocumentType.RNC:
            return validate_rnc(number)
        return clean_document(number)
    except DjangoValidationError as exc:
        raise CustomerRowError(f"documento: {exc.messages[0]}") from exc


def migrate_customer(
    raw: dict[str, str], branches: dict[str, Branch], user
) -> tuple[Customer, bool]:
    """(customer, created): runs inside the company's tenant context, as
    ``user`` (the manager running the migration)."""
    data = _payload(raw, branches)
    number = _normalized(data["document_type"], data["document_number"])
    existing = Customer.objects.filter(document_number=number).first()
    if existing is not None:
        return existing, False
    serializer = CustomerSerializer(data=data, context={"request": SimpleNamespace(user=user)})
    if not serializer.is_valid():
        raise CustomerRowError(
            "; ".join(
                f"{field}: {' '.join(str(message) for message in messages)}"
                for field, messages in serializer.errors.items()
            )
        )
    return serializer.save(), True
