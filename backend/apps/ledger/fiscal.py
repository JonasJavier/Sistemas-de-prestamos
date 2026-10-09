"""Fiscal receipts (e-CF) for the company's income, and the DGII monthly
formats 606 (purchases) and 607 (sales) — decisions 075 and 085.

Interest and late fees are ITBIS-exempt (art. 344 of the Tax Code); a taxed
charge carries its 18 %. The principal is not income and is never invoiced.
Receipts are queued «por emitir» and get their e-NCF when issued; the
certified-provider integration that would issue them automatically depends
on each company's digital certificate (pending, Jonas).
"""

import csv
import datetime as dt
import io
import re
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.ledger import accounting
from apps.ledger.models import FiscalDocument

ZERO = Decimal("0.00")
ROLES = (authz.GERENTE, authz.CONTABILIDAD)
ENCF_RE = re.compile(r"^E(3[1-9]|4[0-7])\d{10}$")


class FiscalError(Exception):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


def _buyer(customer) -> tuple[str, str, str]:
    """(kind, name, document): a company with RNC gets crédito fiscal (E31)."""
    document = customer.document_number or ""
    if customer.document_type == "rnc":
        return FiscalDocument.Kind.CREDIT, customer.display_name, document
    if customer.document_type == "passport":
        document = ""
    return FiscalDocument.Kind.CONSUMER, customer.display_name, document


def for_payment(payment) -> FiscalDocument | None:
    """Interest, late fee and charges collected by a payment (exempt)."""
    from apps.payments.models import PaymentAllocation

    income = (
        PaymentAllocation.objects.filter(
            payment=payment, component__in=["interest", "late_fee", "charges"]
        ).aggregate(total=Sum("amount"))["total"]
        or ZERO
    )
    if income <= 0:
        return None
    customer = payment.customer
    kind, name, document = _buyer(customer)
    return FiscalDocument.objects.create(
        company_id=payment.company_id,
        kind=kind,
        customer=customer,
        buyer_name=name,
        buyer_document=document,
        date=payment.value_date,
        concept=f"Intereses, mora y cargos del préstamo {payment.loan.number} "
        f"(recibo {payment.number})",
        exempt_amount=income,
        total=income,
        source_type="payments.payment",
        source_id=payment.id,
    )


def for_disbursement(loan, charges, on: dt.date) -> FiscalDocument | None:
    """The charges taken when the loan is disbursed (taxed ones with ITBIS)."""
    from apps.lending.disbursement import ITBIS_RATE
    from engine.money import money

    exempt = taxed = itbis = ZERO
    for charge in charges:
        if charge.taxed:
            base = money(charge.amount / (1 + ITBIS_RATE))
            taxed += base
            itbis += charge.amount - base
        else:
            exempt += charge.amount
    total = exempt + taxed + itbis
    if total <= 0:
        return None
    kind, name, document = _buyer(loan.customer)
    return FiscalDocument.objects.create(
        company_id=loan.company_id,
        kind=kind,
        customer=loan.customer,
        buyer_name=name,
        buyer_document=document,
        date=on,
        concept=f"Cargos del préstamo {loan.number}",
        exempt_amount=exempt,
        taxed_amount=taxed,
        itbis=itbis,
        total=total,
        source_type="lending.disbursement",
        source_id=loan.id,
    )


def on_reversal(source_type: str, source_id, on: dt.date) -> None:
    """A pending receipt is voided; an issued one needs a credit note (E34)."""
    for document in FiscalDocument.objects.filter(
        source_type=source_type, source_id=source_id, modifies__isnull=True
    ).exclude(status=FiscalDocument.Status.VOIDED):
        if document.status == FiscalDocument.Status.PENDING:
            document.status = FiscalDocument.Status.VOIDED
            document.void_reason = "La operación se reversó antes de emitirlo"
            document.save(update_fields=["status", "void_reason", "updated_at"])
            continue
        FiscalDocument.objects.create(
            company_id=document.company_id,
            kind=FiscalDocument.Kind.CREDIT_NOTE,
            customer=document.customer,
            buyer_name=document.buyer_name,
            buyer_document=document.buyer_document,
            date=on,
            concept=f"Anula {document.ncf}: {document.concept}"[:300],
            exempt_amount=document.exempt_amount,
            taxed_amount=document.taxed_amount,
            itbis=document.itbis,
            total=document.total,
            source_type=source_type,
            source_id=source_id,
            modifies=document,
        )


def _check(user: User) -> None:
    if not authz.has_any_role(user, *ROLES):
        raise FiscalError("Los comprobantes los llevan el gerente y contabilidad.", "forbidden")


@transaction.atomic
def issue(*, document: FiscalDocument, user: User, ncf: str) -> FiscalDocument:
    """Record the e-NCF the DGII (or the provider) assigned."""
    _check(user)
    document = FiscalDocument.objects.select_for_update().get(pk=document.pk)
    if document.status != FiscalDocument.Status.PENDING:
        raise FiscalError("Ese comprobante ya no está por emitir.", "state")
    ncf = ncf.strip().upper().replace("-", "")
    if not ENCF_RE.match(ncf) or not ncf.startswith(document.kind):
        raise FiscalError(
            f"El e-NCF de este comprobante empieza con {document.kind} y lleva 10 dígitos más.",
            "ncf",
        )
    if FiscalDocument.objects.filter(ncf=ncf).exists():
        raise FiscalError("Ese e-NCF ya está registrado en otro comprobante.", "ncf")
    document.ncf, document.status = ncf, FiscalDocument.Status.ISSUED
    document.issued_at, document.issued_by = timezone.now(), user
    document.save(update_fields=["ncf", "status", "issued_at", "issued_by", "updated_at"])
    record_event(
        company_id=document.company_id,
        type="fiscal.issued",
        target=document,
        actor=user,
        summary=f"{document.get_kind_display()} {ncf}: RD$ {document.total:,.2f}",
    )
    return document


@transaction.atomic
def void(*, document: FiscalDocument, user: User, reason: str) -> FiscalDocument:
    _check(user)
    document = FiscalDocument.objects.select_for_update().get(pk=document.pk)
    if document.status != FiscalDocument.Status.PENDING:
        raise FiscalError("Un comprobante emitido se anula con una nota de crédito.", "state")
    if not reason.strip():
        raise FiscalError("Escribe por qué no se emite.", "reason")
    document.status = FiscalDocument.Status.VOIDED
    document.void_reason = reason.strip()[:300]
    document.save(update_fields=["status", "void_reason", "updated_at"])
    return document


# --- Exports ------------------------------------------------------------------------------------


def _id_type(document: str) -> str:
    return "1" if len(document) == 9 else "2" if len(document) == 11 else ""


def _rows_csv(header: list[str], rows: list[list]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return "﻿" + buffer.getvalue()  # BOM: Excel opens the accents right


def pending_csv() -> str:
    rows = [
        [
            d.kind,
            d.date.isoformat(),
            d.buyer_document,
            d.buyer_name,
            d.concept,
            d.exempt_amount,
            d.taxed_amount,
            d.itbis,
            d.total,
            d.modifies.ncf if d.modifies_id else "",
        ]
        for d in FiscalDocument.objects.filter(status=FiscalDocument.Status.PENDING)
        .select_related("modifies")
        .order_by("date", "created_at")
    ]
    return _rows_csv(
        [
            "Tipo",
            "Fecha",
            "RNC o cédula",
            "Comprador",
            "Concepto",
            "Monto exento",
            "Monto gravado",
            "ITBIS",
            "Total",
            "e-NCF que modifica",
        ],
        rows,
    )


PAYMENT_FORM_606 = {"cash": "01", "transfer": "02", "check": "02", "card": "03"}


def format_606(year: int, month: int) -> str:
    """Purchases of the month with RNC/cédula and NCF, in the DGII 606 columns.
    The ITBIS paid goes to cost: the company provides an exempt service."""
    from apps.expenses.models import Expense, Kind

    first, last = accounting.month_bounds(year, month)
    rows = []
    for e in (
        Expense.objects.filter(kind=Kind.EXPENSE, status=Expense.Status.POSTED)
        .filter(date__gte=first, date__lte=last)
        .exclude(ncf="")
        .exclude(party_document="")
        .exclude(category__nature="owner")  # personal spending is not the company's
        .select_related("category")
        .order_by("date")
    ):
        net = e.amount - e.itbis
        rows.append(
            [
                e.party_document,
                _id_type(e.party_document),
                e.category.dgii_type,
                e.ncf,
                "",
                e.date.strftime("%Y%m%d"),
                e.date.strftime("%Y%m%d"),
                net,
                "0.00",
                net,
                e.itbis,
                "0.00",
                "0.00",
                e.itbis,
                "0.00",
                PAYMENT_FORM_606.get(e.method, "02"),
            ]
        )
    return _rows_csv(
        [
            "RNC o Cédula",
            "Tipo Id",
            "Tipo Bienes y Servicios Comprados",
            "NCF",
            "NCF o Documento Modificado",
            "Fecha Comprobante",
            "Fecha Pago",
            "Monto Facturado en Servicios",
            "Monto Facturado en Bienes",
            "Total Monto Facturado",
            "ITBIS Facturado",
            "ITBIS Retenido",
            "ITBIS sujeto a Proporcionalidad",
            "ITBIS llevado al Costo",
            "ITBIS por Adelantar",
            "Forma de Pago",
        ],
        rows,
    )


def format_607(year: int, month: int) -> str:
    """Receipts issued in the month, in the DGII 607 columns (financial
    income, type 02)."""
    first, last = accounting.month_bounds(year, month)
    rows = []
    for d in (
        FiscalDocument.objects.filter(status=FiscalDocument.Status.ISSUED)
        .filter(date__gte=first, date__lte=last)
        .select_related("modifies")
        .order_by("date")
    ):
        sign = -1 if d.kind == FiscalDocument.Kind.CREDIT_NOTE else 1
        rows.append(
            [
                d.buyer_document,
                _id_type(d.buyer_document),
                d.ncf,
                d.modifies.ncf if d.modifies_id else "",
                "02",
                d.date.strftime("%Y%m%d"),
                sign * (d.total - d.itbis),
                sign * d.itbis,
            ]
        )
    return _rows_csv(
        [
            "RNC/Cédula o Pasaporte",
            "Tipo Identificación",
            "Número Comprobante Fiscal",
            "Número Comprobante Fiscal Modificado",
            "Tipo de Ingreso",
            "Fecha Comprobante",
            "Monto Facturado",
            "ITBIS Facturado",
        ],
        rows,
    )
