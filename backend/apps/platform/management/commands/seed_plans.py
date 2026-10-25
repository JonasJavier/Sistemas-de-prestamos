"""Decision 124: the three plans Jonas decided on 25/10/2026, and the trial
with everything in it. Idempotent: run it again to restore the prices."""

from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.platform.models import Plan

PLANS = [
    # name, price, tier, max_branches, max_users, max_active_loans
    ("Esencial", "990.00", "esencial", 1, 3, None),
    ("Profesional", "2290.00", "profesional", 3, 10, None),
    ("Empresa", "3690.00", "empresa", None, None, None),
]


class Command(BaseCommand):
    help = (
        "Carga o actualiza los planes Esencial, Profesional y Empresa, y pone la prueba con todo."
    )

    def handle(self, *args, **options) -> None:
        for name, price, tier, branches, users, loans in PLANS:
            plan, created = Plan.objects.update_or_create(
                name=name,
                defaults={
                    "monthly_price": Decimal(price),
                    "currency": "DOP",
                    "tier": tier,
                    "max_branches": branches,
                    "max_users": users,
                    "max_active_loans": loans,
                    "is_trial": False,
                    "is_active": True,
                },
            )
            self.stdout.write(f"{'Creado' if created else 'Actualizado'}: {plan.name} RD$ {price}")
        # The trial shows the whole system (the site promises «prueba completa»).
        updated = Plan.objects.filter(is_trial=True).update(tier="empresa")
        self.stdout.write(f"Planes de prueba con todas las funciones: {updated}")
