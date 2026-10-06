"""Dominican holidays per company (doc 03 - section 4).

Fixed dates arrive confirmed; the ones Law 139-97 may move to Monday
arrive unconfirmed and each company confirms or moves them. The religious
movable ones (Viernes Santo, Corpus Christi) change every year, so each
company adds them. Seeding is idempotent: re-running a year adds only
what is missing and never touches a date the company edited.
"""

import datetime as dt
from uuid import UUID

from apps.core.models import Holiday

FIXED_HOLIDAYS = [
    ((1, 1), "Año Nuevo"),
    ((1, 21), "Nuestra Señora de la Altagracia"),
    ((2, 27), "Independencia Nacional"),
    ((12, 25), "Navidad"),
]
MOVABLE_HOLIDAYS = [
    ((1, 6), "Día de los Santos Reyes"),
    ((1, 26), "Natalicio de Juan Pablo Duarte"),
    ((5, 1), "Día del Trabajo"),
    ((8, 16), "Restauración de la República"),
    ((11, 6), "Día de la Constitución"),
]


def seed_year(company_id: UUID, year: int) -> int:
    """Add the year's holidays that are missing; returns how many were added."""
    existing_names = set(
        Holiday.objects.filter(company_id=company_id, date__year=year).values_list(
            "name", flat=True
        )
    )
    rows = [
        Holiday(
            company_id=company_id,
            date=dt.date(year, month, day),
            name=name,
            is_confirmed=confirmed,
        )
        for holidays, confirmed in ((FIXED_HOLIDAYS, True), (MOVABLE_HOLIDAYS, False))
        for (month, day), name in holidays
        if name not in existing_names  # a moved holiday keeps its name
    ]
    created = Holiday.objects.bulk_create(rows, ignore_conflicts=True)
    return len(created)
