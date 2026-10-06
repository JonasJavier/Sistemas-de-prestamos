"""Private upload validation (doc 06 - section 8).

Only PDF, JPG, PNG and HEIC, up to 10 MB, and the real content is
checked by magic bytes, not just the extension the browser claims.
"""

import hashlib

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile

MAX_BYTES = 10 * 1024 * 1024

ALLOWED_TYPES = {
    "application/pdf": "PDF",
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/heic": "HEIC",
}


def _detect_content_type(head: bytes) -> str | None:
    if head.startswith(b"%PDF"):
        return "application/pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if (
        len(head) >= 12
        and head[4:8] == b"ftyp"
        and head[8:12]
        in (
            b"heic",
            b"heix",
            b"hevc",
            b"mif1",
        )
    ):
        return "image/heic"
    return None


def inspect_private_file(file: UploadedFile) -> tuple[str, int, str]:
    """Validate and return (content_type, size, sha256)."""
    if file.size is None or file.size > MAX_BYTES:
        raise ValidationError("El archivo supera el máximo de 10 MB.")
    file.seek(0)
    head = file.read(16)
    content_type = _detect_content_type(head)
    if content_type is None:
        raise ValidationError("Solo se aceptan archivos PDF, JPG, PNG o HEIC.")
    file.seek(0)
    digest = hashlib.sha256()
    for chunk in file.chunks():
        digest.update(chunk)
    file.seek(0)
    return content_type, file.size, digest.hexdigest()
