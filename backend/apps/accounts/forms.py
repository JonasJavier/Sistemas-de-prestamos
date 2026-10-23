"""What a person fills to join Cobradía with Google (decision 118).

allauth's social signup form carries these fields: either the company they
register (F19) or the invitation they accept (F17). The account's address is
the one Google verified; it cannot be swapped for another one here.
"""

from django import forms
from django.utils import timezone

from apps.accounts.models import Invitation


class JoinFields(forms.Form):
    first_name = forms.CharField(max_length=150)
    last_name = forms.CharField(max_length=150)
    invitation = forms.CharField(max_length=128, required=False)
    company_legal_name = forms.CharField(max_length=200, required=False)
    company_trade_name = forms.CharField(max_length=200, required=False)
    rnc = forms.CharField(max_length=11, required=False)
    phone = forms.CharField(max_length=30, required=False)
    accept_terms = forms.BooleanField(required=False)

    def clean(self) -> dict:
        data = super().clean()
        sociallogin = getattr(self, "sociallogin", None)
        google_email = (sociallogin.user.email if sociallogin else "").lower()
        if google_email and (data.get("email") or "").lower() != google_email:
            self.add_error("email", "Usa el correo de tu cuenta de Google.")
        token = data.get("invitation")
        if token:
            invitation = Invitation.objects.filter(token=token, accepted_at__isnull=True).first()
            if invitation is None:
                self.add_error("invitation", "La invitación no existe o ya fue usada.")
            elif invitation.expires_at <= timezone.now():
                self.add_error("invitation", "La invitación venció. Pide una nueva.")
            elif invitation.email.lower() != google_email:
                self.add_error(
                    "invitation",
                    f"Esta invitación es para {invitation.email}: entra con esa cuenta de Google.",
                )
            return data
        if len((data.get("company_legal_name") or "").strip()) < 3:
            self.add_error("company_legal_name", "Escribe el nombre de tu financiera.")
        if not data.get("accept_terms"):
            self.add_error(
                "accept_terms",
                "Para crear la cuenta acepta los términos de servicio y el aviso de privacidad.",
            )
        return data

    def signup(self, request, user) -> None:
        """allauth's hook; SocialAccountAdapter.save_user already did the work."""
