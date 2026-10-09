"""P70 · Empresa and the effective-cost ceiling (decision 075)."""

from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from apps.core.models import Company
from apps.core.tenancy import company_context

URL = "/api/v1/ajustes/empresa/"
SIMULATE = "/api/v1/simulador/"


def _png() -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", (40, 20), "#0e6b4f").save(buffer, format="PNG")
    return SimpleUploadedFile("logo.png", buffer.getvalue(), content_type="image/png")


def test_the_manager_edits_the_company_and_others_cannot(tenant, other_tenant) -> None:
    manager = tenant.client("gerente")
    response = manager.patch(
        URL,
        {
            "trade_name": "Uno Préstamos",
            "rnc": "1-01-23456-7",
            "collector_cash_limit": "15000",
            "max_effective_annual_rate": "3.5",
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["rnc"] == "101234567"
    assert data["collector_cash_limit"] == "15000.00"
    assert data["legal_max_effective_annual_rate"] is None
    # Contabilidad reads, does not write; the cashier does neither.
    accounting = tenant.client("contabilidad")
    assert accounting.get(URL).status_code == 200
    assert accounting.patch(URL, {"trade_name": "X"}, format="json").status_code == 403
    assert tenant.client("cajero").get(URL).status_code == 403
    # Each manager only ever reaches their own company.
    assert other_tenant.client("gerente").get(URL).json()["trade_name"] != "Uno Préstamos"
    with company_context(tenant.company.id):
        assert Company.objects.get(pk=tenant.company.id).max_effective_annual_rate == Decimal(
            "3.5000"
        )


def test_bad_values_are_rejected(tenant) -> None:
    manager = tenant.client("gerente")
    response = manager.patch(
        URL,
        {"rnc": "123", "capacity_alert_ratio": "2", "max_effective_annual_rate": "0"},
        format="json",
    )
    assert response.status_code == 400
    assert set(response.json()) >= {"rnc", "capacity_alert_ratio", "max_effective_annual_rate"}


def test_the_logo_must_be_a_real_image(tenant) -> None:
    manager = tenant.client("gerente")
    fake = SimpleUploadedFile("logo.png", b"not an image", content_type="image/png")
    assert manager.patch(URL, {"logo": fake}, format="multipart").status_code == 400
    response = manager.patch(URL, {"logo": _png()}, format="multipart")
    assert response.status_code == 200, response.content
    assert response.json()["has_logo"] is True
    logo = manager.get(f"{URL}logo/")
    assert (logo.status_code, logo["Content-Type"]) == (200, "image/png")
    assert manager.patch(URL, {"remove_logo": True}, format="json").json()["has_logo"] is False


def _quote(tenant):
    return tenant.client("gerente").post(
        SIMULATE,
        {
            "product": str(tenant.product("Cuota Fija (mensual)").id),
            "amount": "10000",
            "installments": 6,
            "frequency": "monthly",
            "rate": "0.05",
        },
        format="json",
    )


def test_the_quote_shows_the_real_cost_and_respects_the_ceiling(tenant) -> None:
    response = _quote(tenant)
    assert response.status_code == 200, response.content
    data = response.json()
    # 5 % a month plus the 2 % discounted closing cost: well above 12 x 5 %.
    assert Decimal(data["effective_annual_rate"]) > Decimal("0.80")
    assert Decimal(data["total_cost"]) == Decimal(data["total_interest"]) + Decimal(
        data["total_charges"]
    )
    tenant.client("gerente").patch(URL, {"max_effective_annual_rate": "0.80"}, format="json")
    refused = _quote(tenant)
    assert refused.status_code == 400
    assert "supera el tope de 80.00%" in refused.json()["rate"][0]


@override_settings(LEGAL_MAX_EFFECTIVE_ANNUAL_RATE="0.5")
def test_the_legal_ceiling_applies_to_every_company(tenant) -> None:
    refused = _quote(tenant)
    assert refused.status_code == 400
    assert "50.00%" in refused.json()["rate"][0]
