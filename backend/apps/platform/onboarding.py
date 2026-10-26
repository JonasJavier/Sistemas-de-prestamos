"""D2 (decision 129): the first steps of a new company, read from what it has
actually done, never from a checklist it ticks by hand. The dashboard of the
manager shows them until all six are done."""

from __future__ import annotations

import datetime as dt

from django.db.models import DurationField, ExpressionWrapper, F, Q

from apps.accounts.models import Invitation, Membership
from apps.cash.models import CashSession
from apps.core.models import Branch, Company
from apps.customers.models import Customer
from apps.lending.models import Loan, LoanProduct

STEPS = ("company", "branch", "product", "team", "cash", "loan")


def first_steps(company: Company) -> dict:
    """Which steps are done, plus the counts the SPA needs to point at the
    right screen (a customer before the first loan)."""
    company_id = company.id
    branches = Branch.objects.filter(company_id=company_id, is_active=True)
    people = Membership.objects.filter(company_id=company_id).values("user_id").distinct().count()
    invited = Invitation.objects.filter(company_id=company_id).exists()
    steps = {
        "company": bool(company.address and company.phone),
        "branch": branches.exclude(address="").exists(),
        # Registration seeds two example products: the step is done once the
        # company shaped one of them (edited after a minute) or added its own.
        "product": LoanProduct.objects.filter(company_id=company_id)
        .annotate(edited=ExpressionWrapper(F("updated_at") - F("created_at"), DurationField()))
        .filter(
            Q(edited__gt=dt.timedelta(minutes=1))
            | Q(created_at__gt=company.created_at + dt.timedelta(minutes=1))
        )
        .exists(),
        "team": people > 1 or invited,
        "cash": CashSession.objects.filter(company_id=company_id).exists(),
        "loan": Loan.objects.filter(company_id=company_id).exists(),
    }
    return {
        "steps": steps,
        "done": sum(1 for key in STEPS if steps[key]),
        "total": len(STEPS),
        "customers": Customer.objects.filter(company_id=company_id).count(),
        "has_logo": bool(company.logo),
    }
