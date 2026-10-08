"""Customers and collateral (doc 05 - section 4.3). All company-scoped."""

import pghistory
from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import Branch, CompanyScopedModel, Municipality, Province, Sector


@pghistory.track()
class Customer(CompanyScopedModel):
    """A person (cedula) or a business (RNC) the company lends to."""

    class Kind(models.TextChoices):
        PERSON = "person", "Persona"
        COMPANY = "company", "Empresa"

    class DocumentType(models.TextChoices):
        CEDULA = "cedula", "Cédula"
        RNC = "rnc", "RNC"
        PASSPORT = "passport", "Pasaporte"

    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        BLOCKED = "blocked", "Bloqueado"

    class Gender(models.TextChoices):
        FEMALE = "f", "Femenino"
        MALE = "m", "Masculino"

    kind = models.CharField(max_length=10, choices=Kind)
    document_type = models.CharField(max_length=10, choices=DocumentType)
    document_number = models.CharField(max_length=20)

    # Person fields (blank for companies)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=Gender, blank=True)
    marital_status = models.CharField(max_length=30, blank=True)
    occupation = models.CharField(max_length=100, blank=True)

    # Company fields (blank for persons)
    legal_name = models.CharField(max_length=200, blank=True)
    legal_representative = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="represented_companies",
    )

    phone = models.CharField(max_length=30)
    phone2 = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    address_line = models.CharField(max_length=300, blank=True)
    province = models.ForeignKey(Province, null=True, blank=True, on_delete=models.PROTECT)
    municipality = models.ForeignKey(Municipality, null=True, blank=True, on_delete=models.PROTECT)
    sector = models.ForeignKey(Sector, null=True, blank=True, on_delete=models.PROTECT)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    home_branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="customers")
    officer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_customers",
    )

    status = models.CharField(max_length=10, choices=Status, default=Status.ACTIVE)
    block_reason = models.CharField(max_length=300, blank=True)

    consent_at = models.DateTimeField(null=True, blank=True)  # Ley 172-13 (F1 step 5)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_type", "document_number"],
                name="customer_document_unique_per_company",
            ),
            models.CheckConstraint(
                condition=(
                    Q(kind="person", first_name__gt="") | Q(kind="company", legal_name__gt="")
                ),
                name="customer_name_matches_kind",
            ),
        ]

    @property
    def display_name(self) -> str:
        if self.kind == self.Kind.COMPANY:
            return self.legal_name
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self) -> str:
        return f"{self.display_name} ({self.document_number})"


@pghistory.track()
class Employment(CompanyScopedModel):
    """Salaried income; feeds the capacity evaluation (F3)."""

    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name="employment")
    employer = models.CharField(max_length=200)
    position = models.CharField(max_length=100, blank=True)
    since = models.DateField(null=True, blank=True)
    monthly_salary = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    employer_phone = models.CharField(max_length=30, blank=True)
    employer_address = models.CharField(max_length=300, blank=True)


@pghistory.track()
class Business(CompanyScopedModel):
    """Self-employment / microcredit income (doc 02, decision 013)."""

    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name="business")
    name = models.CharField(max_length=200)
    activity = models.CharField(max_length=200, blank=True)
    address = models.CharField(max_length=300, blank=True)
    since = models.DateField(null=True, blank=True)
    monthly_sales = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    monthly_expenses = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)


@pghistory.track()
class Relative(CompanyScopedModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="relatives")
    name = models.CharField(max_length=200)
    relationship = models.CharField(max_length=50)
    phone = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=300, blank=True)


@pghistory.track()
class Reference(CompanyScopedModel):
    """Personal or commercial reference, with its verification trail."""

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="references")
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=30)
    relationship = models.CharField(max_length=100, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_result = models.CharField(max_length=300, blank=True)


class PrivateFileBase(CompanyScopedModel):
    """Common shape for private uploads; served only via expiring links."""

    file = models.FileField(upload_to="private/%Y/%m/")
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        abstract = True


@pghistory.track()
class CustomerFile(PrivateFileBase):
    class Kind(models.TextChoices):
        ID_FRONT = "id_front", "Cédula (frente)"
        ID_BACK = "id_back", "Cédula (dorso)"
        INCOME_PROOF = "income_proof", "Comprobante de ingresos"
        PHOTO = "photo", "Foto"
        CONSENT = "consent", "Consentimiento firmado"
        OTHER = "other", "Otro"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="files")
    kind = models.CharField(max_length=20, choices=Kind)


@pghistory.track()
class Collateral(CompanyScopedModel):
    """A pledged asset; exists once and may back several loans over time."""

    class Type(models.TextChoices):
        VEHICLE = "vehicle", "Vehículo"
        PROPERTY = "property", "Inmueble"
        OTHER = "other", "Otro"

    class Status(models.TextChoices):
        REGISTERED = "registered", "Registrado"
        PLEDGED = "pledged", "En garantía"
        RELEASED = "released", "Liberado"
        EXECUTED = "executed", "Ejecutado"

    owner = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="collaterals")
    type = models.CharField(max_length=10, choices=Type)
    description = models.CharField(max_length=300)
    status = models.CharField(max_length=10, choices=Status, default=Status.REGISTERED)
    appraised_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="DOP")
    appraised_at = models.DateField(null=True, blank=True)
    appraiser = models.CharField(max_length=200, blank=True)

    def __str__(self) -> str:
        return f"{self.get_type_display()}: {self.description}"


@pghistory.track()
class VehicleDetail(CompanyScopedModel):
    collateral = models.OneToOneField(Collateral, on_delete=models.CASCADE, related_name="vehicle")
    brand = models.CharField(max_length=60)
    model = models.CharField(max_length=60)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    color = models.CharField(max_length=30, blank=True)
    plate = models.CharField(max_length=20, blank=True)
    chassis = models.CharField(max_length=40, blank=True)
    registration = models.CharField(max_length=40, blank=True)  # matrícula


@pghistory.track()
class PropertyDetail(CompanyScopedModel):
    collateral = models.OneToOneField(Collateral, on_delete=models.CASCADE, related_name="property")
    title_number = models.CharField(max_length=60, blank=True)
    cadastral_designation = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=300, blank=True)
    area_m2 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)


@pghistory.track()
class CollateralFile(PrivateFileBase):
    class Kind(models.TextChoices):
        PHOTO = "photo", "Foto"
        DOCUMENT = "document", "Documento"
        APPRAISAL = "appraisal", "Tasación"

    collateral = models.ForeignKey(Collateral, on_delete=models.CASCADE, related_name="files")
    kind = models.CharField(max_length=20, choices=Kind)


class BranchAccessGrant(CompanyScopedModel):
    """Serving a customer of another branch (decision 033 and 059): asked
    with a reason, logged, and valid only for the rest of the day."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="access_grants")
    note = models.CharField(max_length=300)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["company", "user", "expires_at"])]
