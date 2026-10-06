"""User invitation flow (F17): nobody sets another person's password."""

import datetime as dt
import secrets

from allauth.account.models import EmailAddress
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Invitation, Membership, Role, User
from apps.core.models import Branch
from apps.core.tenancy import company_context

INVITATION_DAYS = 7


class InvitationError(Exception):
    pass


def invite_user(
    *,
    invited_by: User,
    email: str,
    branch: Branch,
    role: Role,
    accept_url_base: str,
) -> Invitation:
    """Create the invitation and email its secure link.

    Caller must already be inside the company's tenant context (the API
    middleware guarantees it), so branch and role can only be the
    inviter's own.
    """
    if User.objects.filter(email__iexact=email).exists():
        raise InvitationError("Ya existe una cuenta con este correo.")

    invitation = Invitation.objects.create(
        company_id=invited_by.company_id,
        email=email,
        branch=branch,
        role=role,
        token=secrets.token_urlsafe(32),
        invited_by=invited_by,
        expires_at=timezone.now() + dt.timedelta(days=INVITATION_DAYS),
    )
    accept_url = f"{accept_url_base.rstrip('/')}/{invitation.token}"
    send_mail(
        subject="Te invitaron a Cobradía",
        message=(
            f"{invited_by.get_full_name() or invited_by.email} te invitó a trabajar en "
            f"Cobradía con el rol {role.name}.\n\n"
            f"Crea tu cuenta aquí (el enlace vence en {INVITATION_DAYS} días):\n{accept_url}\n"
        ),
        from_email=None,
        recipient_list=[email],
    )
    return invitation


@transaction.atomic
def accept_invitation(*, token: str, first_name: str, last_name: str, password: str) -> User:
    """Public acceptance: the token is the credential (table exempt from RLS)."""
    try:
        invitation = Invitation.objects.get(token=token, accepted_at__isnull=True)
    except Invitation.DoesNotExist as exc:
        raise InvitationError("La invitación no existe o ya fue usada.") from exc
    if invitation.expires_at <= timezone.now():
        raise InvitationError("La invitación venció. Pide una nueva.")
    if User.objects.filter(email__iexact=invitation.email).exists():
        raise InvitationError("Ya existe una cuenta con este correo.")

    user = User.objects.create_user(
        invitation.email,
        password,
        company_id=invitation.company_id,
        first_name=first_name,
        last_name=last_name,
    )
    # Receiving the emailed link proves ownership of the address.
    EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    with company_context(invitation.company_id):
        Membership.objects.create(
            company_id=invitation.company_id,
            user=user,
            branch_id=invitation.branch_id,
            role_id=invitation.role_id,
        )
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at", "updated_at"])
    return user
