"""Issuing documents (doc 09 - section 1): HTML templates -> PDF.

``issue`` renders once, stores the bytes with their sha256 and returns
the register row; reprints serve the stored file, so they are identical.
Loan documents are generated right after the disbursement commits (and
lazily if that ever failed): their data is frozen, so the content is the
same whenever they are produced.
"""

import hashlib
import secrets
from decimal import Decimal

from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone
from num2words import num2words

from apps.core.models import Company
from apps.documents.models import GeneratedDocument
from apps.lending.models import Loan, ProductCharge
from engine.rates import RateUnit, annual_equivalent, effective_annual_rate, monthly_equivalent

TEMPLATE_VERSION = "1.0"

FREQUENCY_LABELS = {
    "daily": ("diaria", "diarias"),
    "interdaily": ("interdiaria", "interdiarias"),
    "weekly": ("semanal", "semanales"),
    "biweekly": ("quincenal", "quincenales"),
    "monthly": ("mensual", "mensuales"),
}

MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


def amount_in_words(amount: Decimal) -> str:
    """``1250.50`` -> «MIL DOSCIENTOS CINCUENTA PESOS DOMINICANOS CON 50/100»."""
    pesos = int(amount)
    cents = int((amount - pesos) * 100)
    words = num2words(pesos, lang="es")
    # Apocope before a masculine noun: «veintiún pesos», «ciento un pesos».
    if words.endswith("uno"):
        words = words[:-3] + ("ún" if words.endswith("veintiuno") else "un")
    if pesos and pesos % 1_000_000 == 0:
        words += " de"  # «un millón de pesos»
    return f"{words} pesos dominicanos con {cents:02d}/100".upper()


def date_in_words(day) -> str:
    return f"{day.day} de {MONTHS[day.month - 1]} de {day.year}"


def _monogram(company: Company) -> str:
    name = company.trade_name or company.legal_name
    initials = [word[0] for word in name.split() if word[:1].isalpha()]
    return "".join(initials[:2]).upper() or "C"


def render_pdf(template: str, context: dict) -> bytes:
    from weasyprint import HTML  # heavy import, only when a document is issued

    html = render_to_string(template, context)
    return HTML(string=html).write_pdf()


def issue(
    *,
    company: Company,
    kind: str,
    target,
    folio: str,
    template: str,
    context: dict,
    issued_by,
    legal_status: str = "pending",
) -> GeneratedDocument:
    from apps.core.qr import data_uri, public_url

    now = timezone.localtime()
    issuer = (issued_by.get_full_name() or issued_by.email) if issued_by else "el sistema"
    # Phase 9 (decision 098): its QR leads to the public verification page.
    token = secrets.token_urlsafe(24)
    verify_url = public_url(f"/v/{token}")
    pdf = render_pdf(
        template,
        {
            **context,
            "qr": data_uri(verify_url),
            "verify_url": verify_url,
            "company": company,
            "monogram": _monogram(company),
            "folio": folio,
            "issued_by": issued_by,
            # Goes inside a CSS string (page footer): no quotes nor backslashes.
            "issuer_label": issuer.replace('"', "'").replace("\\", "/"),
            "issued_at": now,
            "legal_pending": legal_status != "validated",
        },
    )
    document = GeneratedDocument(
        company_id=company.id,
        kind=kind,
        template_version=TEMPLATE_VERSION,
        legal_status=legal_status,
        target_type=target._meta.label_lower,
        target_id=target.pk,
        folio=folio,
        sha256=hashlib.sha256(pdf).hexdigest(),
        issued_by=issued_by,
    )
    document.file.save(f"{folio}.pdf", ContentFile(pdf), save=False)
    document.save()
    from apps.core.models import PublicLink

    PublicLink.objects.create(
        token=token, tenant=company.id, kind=PublicLink.Kind.DOCUMENT, object_id=document.id
    )
    return document


def _loan_context(loan: Loan) -> dict:
    terms = loan.terms.order_by("-version").first()
    rows = list(loan.installments.filter(terms=terms).order_by("number"))
    balance = terms.principal
    schedule = []
    for row in rows:
        balance -= row.principal_due
        schedule.append(
            {"row": row, "total": row.principal_due + row.interest_due, "balance": balance}
        )
    total_interest = sum((r.interest_due for r in rows), Decimal("0.00"))
    total_installments = sum((r.principal_due + r.interest_due for r in rows), Decimal("0.00"))
    charges = list(loan.charges.all())
    total_charges = sum((c.amount for c in charges), Decimal("0.00"))
    disbursement = loan.disbursement
    singular, plural = FREQUENCY_LABELS[terms.frequency]
    # Decision 075: the real annual cost of the original conditions (version
    # 1), charges included; a charge paid in cash shrinks what was received.
    first_terms = loan.terms.order_by("version").first()
    paid_upfront = sum(
        (c.amount for c in charges if c.mode == ProductCharge.Mode.CASH), Decimal("0.00")
    )
    effective_rate = effective_annual_rate(
        loan.disbursed_on,
        max(disbursement.net - paid_upfront, Decimal("0.01")),
        [
            (row.due_date, row.principal_due + row.interest_due)
            for row in loan.installments.filter(terms=first_terms)
        ],
    )
    unit = RateUnit(terms.rate_unit)
    return {
        "loan": loan,
        "branch": loan.branch,
        "customer": loan.customer,
        "terms": terms,
        "schedule": schedule,
        "first_due": rows[0].due_date if rows else None,
        "last_due": rows[-1].due_date if rows else None,
        "frequency_plural": plural,
        "frequency_singular": singular,
        "periodic_rate_pct": terms.periodic_rate * 100,
        "monthly_rate_pct": monthly_equivalent(terms.rate, unit, terms.frequency) * 100,
        "annual_rate_pct": annual_equivalent(terms.rate, unit, terms.frequency) * 100,
        "total_interest": total_interest,
        "total_installments": total_installments,
        "charges": charges,
        "total_charges": total_charges,
        "credit_cost": total_interest + total_charges,
        "effective_rate_pct": effective_rate * 100,
        "disbursement": disbursement,
        "principal_words": amount_in_words(terms.principal),
        "disbursed_words": date_in_words(loan.disbursed_on),
        "guarantors": [g.customer for g in loan.guarantors.select_related("customer")],
        "collaterals": [c.collateral for c in loan.collaterals.select_related("collateral")],
        "late_fee_cap_pct": terms.late_fee_cap_pct * 100,
        "late_fee_rate_pct": terms.late_fee_monthly_rate * 100,
    }


LOAN_DOCUMENTS = [
    (GeneratedDocument.Kind.PROMISSORY_NOTE, "documents/promissory_note.html", "P"),
    (GeneratedDocument.Kind.PAYMENT_SCHEDULE, "documents/payment_schedule.html", "T"),
]


def ensure_loan_documents(loan: Loan, *, issued_by) -> list[GeneratedDocument]:
    """The pagaré and the payment table of a loan, issued once each."""
    existing = {
        doc.kind: doc
        for doc in GeneratedDocument.objects.filter(target_type="lending.loan", target_id=loan.pk)
    }
    missing = [spec for spec in LOAN_DOCUMENTS if spec[0] not in existing]
    if missing:
        company = Company.objects.get(pk=loan.company_id)
        context = _loan_context(loan)
        for kind, template, suffix in missing:
            existing[kind] = issue(
                company=company,
                kind=kind,
                target=loan,
                folio=f"{loan.number}-{suffix}",
                template=template,
                context=context,
                issued_by=issued_by,
            )
    # Doc 09 «Legales» (decision 096): the contract of each kind of asset in guarantee.
    from apps.documents import legal

    contracts = []
    for kind in legal.contract_kinds(loan):
        if kind not in existing:
            existing[kind] = legal.issue_contract(loan, kind, issued_by=issued_by)
        contracts.append(existing[kind])
    return [existing[kind] for kind, _template, _suffix in LOAN_DOCUMENTS] + contracts


# --- Phase 4: cash, settlements and payoff letters (doc 09 - section 2) ----------

MOVEMENT_LABELS = {
    "payments.payment": "Cobros en efectivo",
    "payments.reversal": "Reversos de cobros",
    "lending.disbursement": "Desembolsos en efectivo",
    "cash.settlement": "Rendiciones de cobradores",
    "cash.funding": "Fondo de apertura",
    "cash.transfer": "Traslados y depósitos",
    "cash.difference": "Diferencia del arqueo",
}


def _person(user) -> str:
    return (user.get_full_name() or user.email) if user else ""


def cash_close_context(session) -> dict:
    from apps.ledger.models import JournalLine
    from apps.payments.models import Payment

    rows: dict[str, dict] = {}
    lines = JournalLine.objects.filter(
        cash_session=session, financial_account_id=session.drawer_id
    ).select_related("entry")
    for line in lines:
        key = line.entry.source_type
        if line.entry.reversal_of_id and key == "payments.payment":
            key = "payments.reversal"
        row = rows.setdefault(
            key,
            {
                "label": MOVEMENT_LABELS.get(key, key),
                "debit": Decimal("0"),
                "credit": Decimal("0"),
                "count": 0,
            },
        )
        row["debit"] += line.debit
        row["credit"] += line.credit
        row["count"] += 1
    others: dict[str, dict] = {}
    for payment in Payment.objects.filter(cash_session=session).exclude(method="cash"):
        row = others.setdefault(
            payment.method,
            {"label": payment.get_method_display(), "count": 0, "amount": Decimal("0")},
        )
        row["count"] += 1
        row["amount"] += payment.amount
    counted = session.counted or Decimal("0")
    return {
        "session": session,
        "branch": session.branch,
        "cashier_name": _person(session.cashier),
        "approver_name": _person(session.approved_by),
        "movements": list(rows.values()),
        "other_methods": list(others.values()),
        "counts": list(session.counts.order_by("-denomination")),
        "fund_left": counted - session.returned_amount,
    }


def issue_cash_close(session, *, issued_by) -> GeneratedDocument:
    """Issued once the supervisor approves the closing (F7 step 6)."""
    existing = GeneratedDocument.objects.filter(
        target_type="cash.cashsession", target_id=session.pk
    ).first()
    if existing is not None:
        return existing
    return issue(
        company=Company.objects.get(pk=session.company_id),
        kind=GeneratedDocument.Kind.CASH_CLOSE,
        target=session,
        folio=session.number,
        template="documents/cash_close.html",
        context=cash_close_context(session),
        issued_by=issued_by,
        legal_status="validated",  # an internal report, not a legal template
    )


def route_settlement_context(route) -> dict:
    return {
        "route": route,
        "branch": route.branch,
        "collector_name": _person(route.collector),
        "receiver_name": _person(route.received_by),
        "payments": list(route.payments.select_related("loan", "customer").order_by("paid_at")),
        "handovers": [
            {"at": h.created_at, "amount": h.amount, "receiver_name": _person(h.received_by)}
            for h in route.handovers.select_related("received_by").order_by("created_at")
        ],
    }


def issue_route_settlement(route, *, issued_by) -> GeneratedDocument:
    existing = GeneratedDocument.objects.filter(
        target_type="cash.routesession", target_id=route.pk
    ).first()
    if existing is not None:
        return existing
    index = route.cash_session.settlements.filter(settled_at__lte=route.settled_at).count()
    return issue(
        company=Company.objects.get(pk=route.company_id),
        kind=GeneratedDocument.Kind.ROUTE_SETTLEMENT,
        target=route,
        folio=f"{route.cash_session.number}-REN{index}",
        template="documents/route_settlement.html",
        context=route_settlement_context(route),
        issued_by=issued_by,
        legal_status="validated",
    )


def issue_payoff_letter(quote, *, issued_by) -> GeneratedDocument:
    loan = quote.loan
    return issue(
        company=Company.objects.get(pk=quote.company_id),
        kind=GeneratedDocument.Kind.PAYOFF_LETTER,
        target=quote,
        folio=quote.number,
        template="documents/payoff_letter.html",
        context={
            "loan": loan,
            "branch": loan.branch,
            "customer": loan.customer,
            "quote": quote,
            "b": quote.breakdown,
            "total_words": amount_in_words(quote.total),
            "final": False,
        },
        issued_by=issued_by,
    )


def issue_payoff_final(payment, *, issued_by) -> GeneratedDocument:
    """F10: the «saldado» letter once a payoff closes the loan."""
    loan = payment.loan
    existing = GeneratedDocument.objects.filter(
        target_type="lending.loan", target_id=loan.pk, kind=GeneratedDocument.Kind.PAYOFF_FINAL
    ).first()
    if existing is not None:
        return existing
    return issue(
        company=Company.objects.get(pk=loan.company_id),
        kind=GeneratedDocument.Kind.PAYOFF_FINAL,
        target=loan,
        folio=f"{loan.number}-CSF",
        template="documents/payoff_letter.html",
        context={
            "loan": loan,
            "branch": loan.branch,
            "customer": loan.customer,
            "payment": payment,
            "collaterals": [c.collateral for c in loan.collaterals.select_related("collateral")],
            "final": True,
        },
        issued_by=issued_by,
    )


def issue_account_statement(loan, *, issued_by) -> GeneratedDocument:
    """«Estado de cuenta» on request (doc 09): the conditions in force, the
    schedule with what was paid, the pending late fee and today's balances.
    Each request is a new issue in the register, frozen as of that day."""
    from apps.payments import portfolio
    from apps.payments.letters import compute

    today = timezone.localdate()
    lines = portfolio.position(loan, today)
    summary = portfolio.summarize(lines, today)
    terms = portfolio.current_terms(loan)
    zero = Decimal("0.00")
    rows = []
    for line in lines:
        inst = line.installment
        paid = inst.principal_paid + inst.interest_paid + inst.charges_paid + inst.late_fee_paid
        rows.append(
            {
                "number": inst.number,
                "due_date": inst.due_date,
                "days_late": line.days_late,
                "due": inst.principal_due + inst.interest_due + inst.charges_due,
                "paid": paid,
                "waived": inst.late_fee_waived + inst.interest_waived,
                "late_fee": line.late_fee,
                "owed": line.total,
            }
        )
    totals = {
        key: sum((row[key] for row in rows), zero)
        for key in ("due", "paid", "waived", "late_fee", "owed")
    }
    payoff_total = compute(loan, today)[0].total if loan.status == "active" else zero
    count = GeneratedDocument.objects.filter(
        target_type="lending.loan",
        target_id=loan.pk,
        kind=GeneratedDocument.Kind.ACCOUNT_STATEMENT,
    ).count()
    return issue(
        company=Company.objects.get(pk=loan.company_id),
        kind=GeneratedDocument.Kind.ACCOUNT_STATEMENT,
        target=loan,
        folio=f"{loan.number}-EC{count + 1:03d}",
        template="documents/account_statement.html",
        context={
            "loan": loan,
            "branch": loan.branch,
            "customer": loan.customer,
            "terms": terms,
            "as_of": today,
            "rows": rows,
            "totals": totals,
            "summary": summary,
            "payoff_total": payoff_total,
            "payments": list(loan.payments.order_by("value_date", "paid_at")),
            "frequency_plural": FREQUENCY_LABELS[terms.frequency][1],
            "periodic_rate_pct": terms.periodic_rate * 100,
        },
        issued_by=issued_by,
        legal_status="validated",  # a statement of facts, not a legal template
    )


def issue_month_close(period, *, issued_by) -> GeneratedDocument:
    """The closing pack of F15: the month's income statement, the balance
    sheet at its last day, the checklist and the accrual (decision 084)."""
    from apps.ledger import accounting

    first, last = accounting.month_bounds(period.year, period.month)
    from apps.core.models import Branch

    company = Company.objects.get(pk=period.company_id)
    branch = Branch.objects.filter(company_id=company.id).order_by("created_at").first()
    issued = GeneratedDocument.objects.filter(
        target_type="ledger.accountingperiod", target_id=period.pk
    ).count()
    return issue(
        company=company,
        kind=GeneratedDocument.Kind.MONTH_CLOSE,
        target=period,
        folio=f"CM-{period.year}{period.month:02d}-{issued + 1}",
        template="documents/month_close.html",
        context={
            "period": period,
            "branch": branch,
            "first": first,
            "last": last,
            "statement": accounting.income_statement(first, last),
            "sheet": (sheet := accounting.balance_sheet(last)),
            "liabilities_and_equity": sheet.liabilities.total + sheet.equity_total,
            "checks": period.checklist.get("checks", []),
            "accrual": period.checklist.get("accrual", {}),
        },
        issued_by=issued_by,
        legal_status="validated",  # an internal report
    )
