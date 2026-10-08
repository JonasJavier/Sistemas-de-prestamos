"""F16, basic: load running loans from a CSV, validating row by row.

    manage.py migrar_prestamos prestamos.csv --usuario gerente@empresa.do
    manage.py migrar_prestamos prestamos.csv --usuario gerente@empresa.do --aplicar

Without --aplicar nothing is saved: the report says what would happen
(F16 step 2). Columns (first row, in Spanish): documento, producto, monto,
tasa, frecuencia, cuotas, fecha_desembolso, primera_cuota, numero_anterior,
cobrador, saldo_capital, pagos — «pagos» as «2026-01-05:1500;2026-02-05:1500».
Rates are fractions (5 % = 0.05), dates are YYYY-MM-DD.
"""

import csv
import datetime as dt
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.core.tenancy import company_context
from apps.customers.models import Customer
from apps.lending.migration import LegacyLoan, MigrationError, migrate_loan
from apps.lending.models import LoanProduct


class _DryRun(Exception):
    pass


def _row(raw: dict, company_users: dict[str, User]) -> LegacyLoan:
    def date(key: str, required: bool = True) -> dt.date | None:
        value = (raw.get(key) or "").strip()
        if not value:
            if required:
                raise MigrationError(f"Falta «{key}».")
            return None
        return dt.date.fromisoformat(value)

    try:
        document = "".join(ch for ch in raw["documento"] if ch.isalnum())
        customer = Customer.objects.select_related("home_branch").get(document_number=document)
    except Customer.DoesNotExist as exc:
        raise MigrationError(f"No hay un cliente con el documento {raw['documento']}.") from exc
    try:
        product = LoanProduct.objects.select_related("late_fee_policy").get(
            name=raw["producto"].strip()
        )
    except LoanProduct.DoesNotExist as exc:
        raise MigrationError(f"No existe el producto «{raw['producto']}».") from exc
    payments = []
    for chunk in filter(None, (raw.get("pagos") or "").split(";")):
        day, amount = chunk.split(":")
        payments.append((dt.date.fromisoformat(day.strip()), Decimal(amount.strip())))
    collector_email = (raw.get("cobrador") or "").strip().lower()
    collector = company_users.get(collector_email) if collector_email else None
    if collector_email and collector is None:
        raise MigrationError(f"No existe el usuario {collector_email}.")
    return LegacyLoan(
        customer=customer,
        product=product,
        amount=Decimal(raw["monto"]),
        rate=Decimal(raw["tasa"]),
        frequency=raw["frecuencia"].strip(),
        installments=int(raw["cuotas"]),
        disbursed_on=date("fecha_desembolso"),
        first_due=date("primera_cuota", required=False),
        legacy_number=(raw.get("numero_anterior") or "").strip(),
        collector=collector,
        principal_balance=Decimal(raw["saldo_capital"]),
        payments=tuple(payments),
    )


class Command(BaseCommand):
    help = "Migra préstamos en curso desde un CSV (F16), validando fila por fila."

    def add_arguments(self, parser) -> None:
        parser.add_argument("archivo")
        parser.add_argument("--usuario", required=True, help="Correo del gerente o administrador")
        parser.add_argument(
            "--aplicar", action="store_true", help="Guarda lo que pase la validación"
        )

    def handle(self, *args, **options) -> None:
        user = User.objects.filter(email=options["usuario"].lower()).first()
        if user is None or user.company_id is None:
            raise CommandError("Ese usuario no existe o no pertenece a una empresa.")
        with open(options["archivo"], encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        if not rows:
            raise CommandError("El archivo no tiene filas.")
        ok = errors = 0
        with company_context(user.company_id):
            company_users = {u.email: u for u in User.objects.filter(company_id=user.company_id)}
            try:
                with transaction.atomic():
                    for line, raw in enumerate(rows, start=2):
                        try:
                            with transaction.atomic():
                                loan = migrate_loan(data=_row(raw, company_users), user=user)
                            ok += 1
                            self.stdout.write(
                                f"Fila {line}: {raw.get('numero_anterior') or '—'} → {loan.number} "
                                f"(capital {loan.principal_outstanding:,.2f})"
                            )
                        except (MigrationError, ValueError, KeyError, InvalidOperation) as exc:
                            errors += 1
                            self.stdout.write(self.style.ERROR(f"Fila {line}: {exc}"))
                    if not options["aplicar"] or errors:
                        raise _DryRun
            except _DryRun:
                pass
        summary = f"{ok} préstamo(s) válidos, {errors} con errores."
        if options["aplicar"] and not errors:
            self.stdout.write(self.style.SUCCESS(f"Migración aplicada: {summary}"))
        elif options["aplicar"]:
            self.stdout.write(self.style.ERROR(f"Nada se guardó: {summary} Corrige y repite."))
        else:
            self.stdout.write(f"Ensayo sin guardar: {summary} Usa --aplicar para cargar.")
