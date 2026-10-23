"""Who may join Cobradía through allauth, and how (decision 118).

A person only joins with their company (company signup, F19) or through an
invitation (F17). allauth's bare signup would leave an account without a
company, so it stays closed; signing up with Google completes one of the two
with the fields of ``apps.accounts.forms.JoinFields``.
"""

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.db import transaction
from django.http import HttpRequest


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request: HttpRequest) -> bool:
        return False


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request: HttpRequest, sociallogin) -> bool:
        return True

    def save_user(self, request: HttpRequest, sociallogin, form=None):
        from apps.accounts.services import accept_invitation
        from apps.platform import services, tasks

        data = form.cleaned_data
        email = sociallogin.user.email
        if data["invitation"]:
            user = accept_invitation(
                token=data["invitation"],
                first_name=data["first_name"],
                last_name=data["last_name"],
                password=None,
                record_email=False,
            )
        else:
            result = services.register_company(
                legal_name=data["company_legal_name"].strip(),
                trade_name=data["company_trade_name"],
                rnc=data["rnc"],
                phone=data["phone"],
                admin_email=email,
                admin_password=None,
                admin_first_name=data["first_name"],
                admin_last_name=data["last_name"],
                terms_version=settings.LEGAL_TERMS_VERSION,
            )
            user = result.admin
            transaction.on_commit(lambda: tasks.notify_owner_of_signup(result.company, email))
        sociallogin.user = user
        sociallogin.save(request)  # links Google and records its verified address
        return user
