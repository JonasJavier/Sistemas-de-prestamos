"""F9 step 2 and doc 09 «Legales» (decision 095): legal documents with the
real data of the file — never fixed fake text (reference defects #3, #16,
#33). Each one is built once as plain paragraphs and rendered as the
issued PDF (kept with its sha256, under the «pendiente de validación
legal» band until the company's lawyer validates the templates, 015) and
as an editable DOCX for the lawyer or the notary.

The texts are factory drafts: **the company's lawyer validates them**.
"""

import io
from dataclasses import dataclass, field
from decimal import Decimal

from django.utils import timezone

from apps.collections.models import LegalCase, LegalProfessional
from apps.documents.models import GeneratedDocument
from apps.documents.services import amount_in_words, date_in_words, issue
from apps.lending.models import Loan

ZERO = Decimal("0.00")


class LegalDocumentError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class LegalText:
    title: str
    paragraphs: list[str]
    signatures: list[tuple[str, str]] = field(default_factory=list)  # (name, role)


def _customer_line(loan: Loan) -> str:
    c = loan.customer
    parts = [f"{c.display_name}, dominicano(a), mayor de edad"]
    if c.marital_status:
        parts.append(c.marital_status.lower())
    if c.occupation:
        parts.append(c.occupation.lower())
    parts.append(
        f"portador(a) de la cédula de identidad y electoral núm. {_doc(c.document_number)}"
    )
    if c.address_line:
        parts.append(f"domiciliado(a) en {c.address_line}")
    return ", ".join(parts)


def _doc(value: str) -> str:
    digits = "".join(ch for ch in value or "" if ch.isdigit())
    if len(digits) == 11:
        return f"{digits[:3]}-{digits[3:10]}-{digits[10]}"
    return value or "—"


def _company_line(loan: Loan) -> str:
    company = loan.company
    line = company.legal_name
    if company.rnc:
        line += f", RNC núm. {company.rnc}"
    if company.address:
        line += f", con domicilio en {company.address}"
    return line


def _professional_line(person: LegalProfessional, role: str) -> str:
    line = f"{person.name}, {role}"
    if person.document:
        line += f", cédula núm. {_doc(person.document)}"
    if person.license:
        line += f", matrícula núm. {person.license}"
    if person.address:
        line += f", con estudio en {person.address}"
    return line


def exigible(loan: Loan) -> Decimal:
    """What is due today: the overdue installments with their late fees."""
    from apps.payments import portfolio

    today = timezone.localdate()
    return sum(
        (
            line.total
            for line in portfolio.position(loan, today)
            if line.installment.due_date < today
        ),
        ZERO,
    )


def _money(amount: Decimal) -> str:
    return f"{amount_in_words(amount)} (RD$ {amount:,.2f})"


# --- The texts -------------------------------------------------------------------------------


def demand_notice(case: LegalCase) -> LegalText:
    """Acto de intimación de pago: only with real arrears, for the exact
    exigible amount (defect #33)."""
    loan = case.loan
    owed = exigible(loan)
    if owed <= 0 or loan.days_past_due <= 0:
        raise LegalDocumentError("Sin atraso real no se emite la intimación.", "not_late")
    today = timezone.localdate()
    return LegalText(
        title="ACTO DE INTIMACIÓN DE PAGO",
        paragraphs=[
            f"En la ciudad de su emisión, a los {date_in_words(today)}.",
            f"A requerimiento de {_company_line(loan)}, quien tiene como abogado apoderado al "
            f"{_professional_line(case.lawyer, 'abogado de los tribunales de la República')}.",
            f"Se INTIMA a {_customer_line(loan)}, deudor(a) del préstamo núm. {loan.number} "
            f"desembolsado el {date_in_words(loan.disbursed_on)} por "
            f"{_money(loan.principal)}.",
            f"Para que en el plazo de cinco (5) días francos pague la suma de {_money(owed)}, "
            f"correspondiente a las cuotas vencidas y su mora al {date_in_words(today)}, con "
            f"{loan.days_past_due} día(s) de atraso.",
            "Advertido de que, a falta de pago en el plazo indicado, el requeriente procederá a "
            "ejercer las vías de derecho que le acuerda la ley para el cobro de su crédito.",
        ],
        signatures=[(case.lawyer.name, "Abogado apoderado")],
    )


def payment_order(case: LegalCase) -> LegalText:
    """Mandamiento de pago, notified by the bailiff of the case."""
    loan = case.loan
    if case.bailiff is None:
        raise LegalDocumentError("Asigna el alguacil del caso.", "bailiff")
    owed = exigible(loan)
    if owed <= 0:
        raise LegalDocumentError("Sin atraso real no hay mandamiento de pago.", "not_late")
    today = timezone.localdate()
    return LegalText(
        title="MANDAMIENTO DE PAGO",
        paragraphs=[
            f"En la ciudad de su emisión, a los {date_in_words(today)}, actuando a "
            f"requerimiento de {_company_line(loan)}, representada por su abogado apoderado "
            f"{_professional_line(case.lawyer, 'abogado')}.",
            f"Yo, {_professional_line(case.bailiff, 'alguacil')}, notifico a "
            f"{_customer_line(loan)} el presente MANDAMIENTO DE PAGO.",
            f"Por el cual se le requiere pagar en el plazo de ley la suma de {_money(owed)}, "
            f"adeudada en virtud del préstamo núm. {loan.number}, más los intereses y gastos que "
            "se generen hasta el pago total.",
            "Advertido de que, a falta de pago, se procederá al embargo de sus bienes conforme "
            "a la ley.",
        ],
        signatures=[(case.bailiff.name, "Alguacil")],
    )


def voluntary_surrender(case: LegalCase) -> LegalText:
    """Acto de entrega voluntaria: the pledged asset, described from
    Garantías (defect #16), before two witnesses of the lawyer."""
    loan = case.loan
    pledged = [
        item.collateral
        for item in loan.collaterals.select_related("collateral__vehicle", "collateral__property")
    ]
    if not pledged:
        raise LegalDocumentError("El préstamo no tiene bienes en garantía.", "collateral")
    descriptions = [_asset(asset) for asset in pledged]
    witnesses = list(case.lawyer.witnesses.filter(is_active=True)[:2])
    today = timezone.localdate()
    return LegalText(
        title="ACTO DE ENTREGA VOLUNTARIA",
        paragraphs=[
            f"En la ciudad de su emisión, a los {date_in_words(today)}.",
            f"{_customer_line(loan)}, en su calidad de deudor(a) del préstamo núm. {loan.number} "
            f"otorgado por {_company_line(loan)}.",
            "DECLARA que entrega de manera libre y voluntaria, en garantía del pago de lo "
            "adeudado, el (los) bien(es) siguiente(s):",
            *[f"— {text}" for text in descriptions],
            "El bien se recibe en el estado en que se encuentra, para su valoración y venta "
            "conforme a la ley; lo obtenido se aplicará al saldo del préstamo.",
            *(
                [
                    "En presencia de los testigos "
                    + " y ".join(_professional_line(w, "testigo") for w in witnesses)
                    + "."
                ]
                if witnesses
                else []
            ),
        ],
        signatures=[
            (loan.customer.display_name, "Deudor(a)"),
            (case.lawyer.name, "Por el acreedor"),
            *[(w.name, "Testigo") for w in witnesses],
        ],
    )


def _asset(asset) -> str:
    text = f"{asset.get_type_display()}: {asset.description}"
    vehicle = getattr(asset, "vehicle", None)
    if vehicle is not None:
        bits = [
            f"marca {vehicle.brand}",
            f"modelo {vehicle.model}",
            f"año {vehicle.year}" if vehicle.year else "",
            f"color {vehicle.color}" if vehicle.color else "",
            f"placa {vehicle.plate}" if vehicle.plate else "",
            f"chasis {vehicle.chassis}" if vehicle.chassis else "",
            f"matrícula {vehicle.registration}" if vehicle.registration else "",
        ]
        text += " (" + ", ".join(bit for bit in bits if bit) + ")"
    prop = getattr(asset, "property", None)
    if prop is not None:
        bits = [
            f"certificado de título {prop.title_number}" if prop.title_number else "",
            f"designación catastral {prop.cadastral_designation}"
            if prop.cadastral_designation
            else "",
            f"ubicado en {prop.location}" if prop.location else "",
        ]
        text += " (" + ", ".join(bit for bit in bits if bit) + ")"
    return text


def notarial_note(case: LegalCase) -> LegalText:
    """Pagaré notarial with the real data of the file (defect #3)."""
    loan = case.loan
    if case.notary is None:
        raise LegalDocumentError("Asigna el notario del caso.", "notary")
    from apps.payments import portfolio

    terms = portfolio.current_terms(loan)
    today = timezone.localdate()
    return LegalText(
        title="PAGARÉ NOTARIAL",
        paragraphs=[
            f"En la ciudad de su emisión, a los {date_in_words(today)}, por ante mí, "
            f"{_professional_line(case.notary, 'notario público')}, comparecen:",
            f"De una parte, {_company_line(loan)}, en lo adelante EL ACREEDOR.",
            f"De la otra parte, {_customer_line(loan)}, en lo adelante EL DEUDOR.",
            f"EL DEUDOR reconoce adeudar a EL ACREEDOR la suma de {_money(loan.principal)}, "
            f"recibida en virtud del préstamo núm. {loan.number} del "
            f"{date_in_words(loan.disbursed_on)}, pagadera en {terms.installments} cuota(s) "
            f"según la tabla de pagos que forma parte de este acto.",
            "En caso de falta de pago de una o más cuotas a su vencimiento, EL ACREEDOR podrá "
            "exigir el pago total de lo adeudado, con su mora, y el presente acto vale título "
            "ejecutorio conforme a la ley.",
            "Leído el presente acto, los comparecientes lo firman junto a mí, notario, que doy fe.",
        ],
        signatures=[
            (loan.customer.display_name, "El deudor"),
            ("Por el acreedor", "El acreedor"),
            (case.notary.name, "Notario público"),
        ],
    )


BUILDERS = {
    GeneratedDocument.Kind.DEMAND_NOTICE: demand_notice,
    GeneratedDocument.Kind.PAYMENT_ORDER: payment_order,
    GeneratedDocument.Kind.VOLUNTARY_SURRENDER: voluntary_surrender,
    GeneratedDocument.Kind.NOTARIAL_NOTE: notarial_note,
}


def build(case: LegalCase, kind: str) -> LegalText:
    builder = BUILDERS.get(kind)
    if builder is None:
        raise LegalDocumentError("Documento legal desconocido.", "kind")
    return builder(case)


def issue_legal(case: LegalCase, kind: str, *, issued_by) -> GeneratedDocument:
    """The PDF, kept with its sha256 (reprints are identical)."""
    from apps.core.models import Company

    text = build(case, kind)
    stamp = timezone.localtime().strftime("%Y%m%d%H%M%S")
    return issue(
        company=Company.objects.get(pk=case.company_id),
        kind=kind,
        target=case,
        folio=f"{case.number}-{kind[:3].upper()}-{stamp}",
        template="documents/legal.html",
        context={"text": text, "branch": case.loan.branch},
        issued_by=issued_by,
    )


def docx(case: LegalCase, kind: str) -> bytes:
    """The editable version for the lawyer or the notary."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    from apps.core.models import Company

    text = build(case, kind)
    company = Company.objects.get(pk=case.company_id)
    document = Document()
    style = document.styles["Normal"]
    style.font.name = "Arial"
    style.font.size = Pt(11)
    header = document.add_paragraph(company.legal_name)
    header.runs[0].bold = True
    document.add_paragraph(
        "Plantilla de fábrica pendiente de validación legal por el abogado de la empresa."
    ).runs[0].italic = True
    heading = document.add_paragraph(text.title)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    heading.runs[0].bold = True
    for paragraph in text.paragraphs:
        body = document.add_paragraph(paragraph)
        body.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    document.add_paragraph()
    for name, role in text.signatures:
        document.add_paragraph("\n\n______________________________")
        document.add_paragraph(f"{name}\n{role}")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
