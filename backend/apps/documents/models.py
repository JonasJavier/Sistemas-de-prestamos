"""Issued documents register (doc 09 - section 1, decision 049).

Every PDF Cobradía emits is stored once with who, when, which template
version and its sha256, so a reprint is byte-identical to the original.
"""

import pgtrigger
from django.conf import settings
from django.db import models

from apps.core.models import CompanyScopedModel


class GeneratedDocument(CompanyScopedModel):
    class Kind(models.TextChoices):
        PROMISSORY_NOTE = "promissory_note", "Pagaré"
        PAYMENT_SCHEDULE = "payment_schedule", "Tabla de pagos"
        PAYOFF_LETTER = "payoff_letter", "Carta de saldo"
        PAYOFF_FINAL = "payoff_final", "Carta de saldo final"
        CASH_CLOSE = "cash_close", "Cierre de caja"
        ROUTE_SETTLEMENT = "route_settlement", "Rendición del cobrador"
        ACCOUNT_STATEMENT = "account_statement", "Estado de cuenta"
        MONTH_CLOSE = "month_close", "Cierre de mes"
        # Phase 8 (F9, decision 095): legal documents from the case.
        DEMAND_NOTICE = "demand_notice", "Acto de intimación de pago"
        PAYMENT_ORDER = "payment_order", "Mandamiento de pago"
        VOLUNTARY_SURRENDER = "voluntary_surrender", "Acto de entrega voluntaria"
        NOTARIAL_NOTE = "notarial_note", "Pagaré notarial"
        PLEDGE_CONTRACT = "pledge_contract", "Contrato con garantía prendaria"
        MORTGAGE_CONTRACT = "mortgage_contract", "Contrato con garantía hipotecaria"

    kind = models.CharField(max_length=30, choices=Kind)
    template_version = models.CharField(max_length=20)
    # Factory templates stay «pendiente» until a lawyer validates them (015).
    legal_status = models.CharField(max_length=10, default="pending")
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    folio = models.CharField(max_length=50)
    file = models.FileField(upload_to="private/documents/%Y/%m/")
    sha256 = models.CharField(max_length=64)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        indexes = [models.Index(fields=["company", "target_type", "target_id"])]
        triggers = [
            pgtrigger.Protect(
                name="generated_document_append_only",
                operation=pgtrigger.Update | pgtrigger.Delete,
            )
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} {self.folio}"
