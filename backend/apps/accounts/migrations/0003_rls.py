"""Row-level security for account tables that carry a company.

Two tables are intentionally NOT protected, because they are reached
before any company is known (their isolation lives in the API layer and
is covered by cross-company tests):
- ``accounts_user``: login looks a user up by email.
- ``accounts_invitation``: the public acceptance endpoint looks the
  invitation up by its secret token, which is itself the credential.
"""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "accounts_role",
    "accounts_membership",
    "accounts_approvallimit",
]


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_approvallimit_approvallimitevent_invitation_and_more"),
    ]

    operations = [enable_rls(table) for table in TABLES]
