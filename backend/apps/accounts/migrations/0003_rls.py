"""Row-level security for account tables that carry a company.

``accounts_user`` is intentionally NOT protected: login must look a user
up by email before any company is known. User isolation is enforced in
the API layer and covered by cross-company tests.
"""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "accounts_role",
    "accounts_membership",
    "accounts_approvallimit",
    "accounts_invitation",
]


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_approvallimit_approvallimitevent_invitation_and_more"),
    ]

    operations = [enable_rls(table) for table in TABLES]
