"""Seeded escalation rules (F8 step 5, decision 077); each company edits them."""

from apps.accounts import authz

# (min_days, action, role): more than 30 days to the supervisor, more than
# 60 the intimation is prepared, more than 90 the legal route is proposed to
# the manager.
DEFAULT_ESCALATION_RULES = [
    (31, "review", authz.SUPERVISOR),
    (61, "intimation", authz.GERENTE),
    (91, "legal", authz.GERENTE),
]


def seed_escalation_rules(company) -> None:
    from apps.collections.models import EscalationRule

    EscalationRule.objects.bulk_create(
        EscalationRule(company=company, min_days=days, action=action, role=role)
        for days, action, role in DEFAULT_ESCALATION_RULES
    )
