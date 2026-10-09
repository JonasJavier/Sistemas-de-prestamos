import re

from django.apps import AppConfig

# «25,000» or «1,250,000.50»: the comma groups thousands in the Dominican
# Republic, as every screen prints amounts. Only well-formed groups of three
# count, so «4,5» is still rejected instead of silently becoming 45.
THOUSANDS = re.compile(r"^\s*-?\d{1,3}(,\d{3})+(\.\d+)?\s*$")


def accept_thousands_separators() -> None:
    """Every DecimalField of the API takes «25,000» like «25000» (forms are
    typed by hand; 36 amount fields would otherwise each clean it)."""
    from rest_framework.fields import DecimalField

    original = DecimalField.to_internal_value
    if getattr(original, "accepts_thousands", False):
        return

    def to_internal_value(self, data):
        if isinstance(data, str) and THOUSANDS.match(data):
            data = data.replace(",", "")
        return original(self, data)

    to_internal_value.accepts_thousands = True
    DecimalField.to_internal_value = to_internal_value


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self) -> None:
        accept_thousands_separators()
