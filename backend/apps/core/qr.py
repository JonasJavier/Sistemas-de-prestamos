"""QR codes of the verification links (doc 09 §1, decision 098): an SVG
data URI that WeasyPrint draws in the PDF and the receipt shows as is."""

import base64
import io

import segno
from django.conf import settings


def public_url(path: str) -> str:
    base = settings.FRONTEND_URL or "http://localhost:5173"
    return f"{base}{path}"


def data_uri(url: str) -> str:
    buffer = io.BytesIO()
    segno.make(url, error="m").save(buffer, kind="svg", scale=3, border=1, dark="#15402F")
    return "data:image/svg+xml;base64," + base64.b64encode(buffer.getvalue()).decode()
