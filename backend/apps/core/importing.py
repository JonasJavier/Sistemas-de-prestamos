"""D1 (decision 131): the portfolio import from the app, on the same engine as
the console commands of F16 (decision 107). One file at a time: the
customers first, then the running loans. Every row is validated; a
rehearsal saves nothing, and an apply saves all or nothing.

The row-by-row work stays in ``apps.customers.migration`` and
``apps.lending.migration``; this module reads the uploaded file, runs the
rows inside one transaction, and turns the outcome into the report the
screen (and the commands) show.
"""

from __future__ import annotations

import datetime as dt
import tempfile
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.db import transaction

from apps.accounts.models import User
from apps.core.models import Branch
from apps.core.tabular import header, read_rows
from apps.core.text import plural
from apps.customers.migration import CustomerRowError, migrate_customer
from apps.customers.models import Customer
from apps.lending.migration import LegacyLoan, MigrationError, migrate_loan
from apps.lending.models import LoanProduct

KINDS = ("clientes", "prestamos")
MAX_ROWS = 5000
MAX_BYTES = 5 * 1024 * 1024

# The template says it in Spanish (decision 107); the engine's names work too.
FREQUENCIES = {
    "diaria": "daily",
    "interdiaria": "interdaily",
    "semanal": "weekly",
    "quincenal": "biweekly",
    "mensual": "monthly",
}


class ImportError_(Exception):
    """A whole-file problem (empty, too big, wrong kind), not a row."""


class _DryRun(Exception):
    pass


@dataclass
class RowResult:
    line: int
    status: str  # created | existing | error
    detail: str


@dataclass
class ImportReport:
    kind: str
    applied: bool
    created: int = 0
    existing: int = 0
    errors: int = 0
    rows: list[RowResult] = field(default_factory=list)

    @property
    def summary(self) -> str:
        if self.kind == "clientes":
            text = (
                f"{plural(self.created, 'cliente nuevo', 'clientes nuevos')}, "
                f"{self.existing} ya existían, {self.errors} con errores."
            )
        else:
            text = (
                f"{plural(self.created, 'préstamo válido', 'préstamos válidos')}, "
                f"{self.errors} con errores."
            )
        if self.applied:
            return f"Importación aplicada: {text}"
        if self.errors:
            return f"Nada se guardó: {text} Corrige el archivo y vuelve a subirlo."
        return f"Ensayo sin guardar: {text} Todo está listo para aplicar."

    def as_dict(self) -> dict:
        return {
            "kind": self.kind,
            "applied": self.applied,
            "created": self.created,
            "existing": self.existing,
            "errors": self.errors,
            "summary": self.summary,
            "rows": [vars(row) for row in self.rows],
        }


def rows_from_upload(name: str, content: bytes) -> list[dict[str, str]]:
    """The rows of an uploaded CSV or Excel (the reader works on paths)."""
    suffix = Path(name or "").suffix.lower()
    if suffix not in (".csv", ".xlsx"):
        raise ImportError_("Sube la plantilla en Excel (.xlsx) o un CSV.")
    if len(content) > MAX_BYTES:
        raise ImportError_("El archivo pesa más de 5 MB.")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(content)
        path = handle.name
    try:
        rows = read_rows(path)
    finally:
        Path(path).unlink(missing_ok=True)
    if not rows:
        raise ImportError_("El archivo no tiene filas con datos.")
    if len(rows) > MAX_ROWS:
        raise ImportError_(f"El archivo tiene más de {MAX_ROWS:,} filas; divídelo.")
    return rows


def legacy_loan_from_row(raw: dict[str, str], company_users: dict[str, User]) -> LegacyLoan:
    """One row of prestamos.xlsx as the engine's LegacyLoan (shared with
    ``migrar_prestamos``)."""

    def date(key: str, required: bool = True) -> dt.date | None:
        value = (raw.get(key) or "").strip()
        if not value:
            if required:
                raise MigrationError(f"Falta «{key}».")
            return None
        try:
            return dt.date.fromisoformat(value)
        except ValueError as exc:
            raise MigrationError(f"«{key}» debe ser una fecha AAAA-MM-DD, no «{value}».") from exc

    for key in ("documento", "producto", "monto", "tasa", "frecuencia", "cuotas", "saldo_capital"):
        if not (raw.get(key) or "").strip():
            raise MigrationError(f"Falta «{key}».")
    document = "".join(ch for ch in raw["documento"] if ch.isalnum())
    try:
        customer = Customer.objects.select_related("home_branch").get(document_number=document)
    except Customer.DoesNotExist as exc:
        raise MigrationError(
            f"No hay un cliente con el documento {raw['documento']}; carga primero los clientes."
        ) from exc
    try:
        product = LoanProduct.objects.select_related("late_fee_policy").get(
            name=raw["producto"].strip()
        )
    except LoanProduct.DoesNotExist as exc:
        raise MigrationError(f"No existe el producto «{raw['producto']}».") from exc
    payments = []
    for chunk in filter(None, (raw.get("pagos") or "").split(";")):
        try:
            day, amount = chunk.split(":")
            payments.append((dt.date.fromisoformat(day.strip()), Decimal(amount.strip())))
        except (ValueError, InvalidOperation) as exc:
            raise MigrationError(
                f"«pagos» debe ir como fecha:monto separados por punto y coma; «{chunk}» no sirve."
            ) from exc
    collector_email = (raw.get("cobrador") or "").strip().lower()
    collector = company_users.get(collector_email) if collector_email else None
    if collector_email and collector is None:
        raise MigrationError(f"No existe el usuario {collector_email}.")
    frequency = FREQUENCIES.get(header(raw["frecuencia"]), raw["frecuencia"].strip())
    if frequency not in FREQUENCIES.values():
        raise MigrationError(
            f"«frecuencia» debe ser diaria, interdiaria, semanal, quincenal o mensual, "
            f"no «{raw['frecuencia']}»."
        )
    try:
        return LegacyLoan(
            customer=customer,
            product=product,
            amount=Decimal(raw["monto"]),
            rate=Decimal(raw["tasa"]),
            frequency=frequency,
            installments=int(raw["cuotas"]),
            disbursed_on=date("fecha_desembolso"),
            first_due=date("primera_cuota", required=False),
            legacy_number=(raw.get("numero_anterior") or "").strip(),
            collector=collector,
            principal_balance=Decimal(raw["saldo_capital"]),
            payments=tuple(payments),
        )
    except (InvalidOperation, ValueError) as exc:
        raise MigrationError(
            "«monto», «tasa», «cuotas» y «saldo_capital» deben ser números sin comas."
        ) from exc


def run_import(*, kind: str, rows: list[dict[str, str]], user: User, apply: bool) -> ImportReport:
    """Runs inside the company's tenant context. A rehearsal, or an apply
    with any error, rolls everything back."""
    if kind not in KINDS:
        raise ImportError_("Tipo de importación desconocido.")
    report = ImportReport(kind=kind, applied=False)
    company_id = user.company_id
    branches = {b.code.upper(): b for b in Branch.objects.filter(is_active=True)}
    company_users = {u.email: u for u in User.objects.filter(company_id=company_id)}
    try:
        with transaction.atomic():
            for line, raw in enumerate(rows, start=2):
                try:
                    with transaction.atomic():
                        if kind == "clientes":
                            customer, new = migrate_customer(raw, branches, user)
                            name = customer.display_name
                            if new:
                                report.created += 1
                                report.rows.append(RowResult(line, "created", name))
                            else:
                                report.existing += 1
                                detail = f"Ya existe: {name}"
                                report.rows.append(RowResult(line, "existing", detail))
                        else:
                            loan = migrate_loan(
                                data=legacy_loan_from_row(raw, company_users), user=user
                            )
                            report.created += 1
                            report.rows.append(
                                RowResult(
                                    line,
                                    "created",
                                    f"{raw.get('numero_anterior') or '—'} → {loan.number} "
                                    f"(capital RD$ {loan.principal_outstanding:,.2f})",
                                )
                            )
                except (
                    CustomerRowError,
                    MigrationError,
                    ValueError,
                    KeyError,
                    InvalidOperation,
                ) as exc:
                    report.errors += 1
                    report.rows.append(RowResult(line, "error", str(exc) or "Fila inválida."))
            if not apply or report.errors:
                raise _DryRun
            report.applied = True
    except _DryRun:
        pass
    return report
