"""Row-level-security helpers for migrations (doc 05 - section 7, rule 11).

Every table that carries a ``company_id`` column gets the same policy:
rows are visible and writable only when they match the session variable
``app.current_company``. ``FORCE`` makes the policy apply even to the
table owner, so development and tests run under the same rules as
production's unprivileged application role.
"""

from django.db import migrations

POLICY = "tenant_isolation"


def enable_rls(table: str) -> migrations.RunSQL:
    # NULLIF: an unset or RESET variable comes back as '' (not NULL), and
    # ''::uuid would error instead of simply matching nothing.
    match = "company_id = NULLIF(current_setting('app.current_company', true), '')::uuid"
    return migrations.RunSQL(
        sql=f"""
            ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
            ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
            CREATE POLICY {POLICY} ON {table}
                USING ({match})
                WITH CHECK ({match});
        """,
        reverse_sql=f"""
            DROP POLICY IF EXISTS {POLICY} ON {table};
            ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;
            ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;
        """,
    )


# Tables that carry company_id on purpose WITHOUT the tenant policy; each
# one is documented where it is created (accounts 0003/0004, platform).
RLS_EXEMPT = {
    "accounts_user",  # login looks users up by email before any tenant
    "accounts_userevent",
    "accounts_invitation",  # the public token lookup is the credential
    "accounts_invitationevent",
    "platform_subscription",  # platform-owned (doc 05 - 4.0)
    "platform_subscriptionevent",
    "platform_supportaccessgrant",
    "platform_supportaccessgrantevent",
    "platform_paymentproof",  # the owner reviews it (decision 125); served by company id
    "platform_paymentproofevent",
}
