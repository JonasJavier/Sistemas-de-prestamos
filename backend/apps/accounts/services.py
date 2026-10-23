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
    from apps.platform import limits

    try:
        limits.check(invited_by.company_id, "users")
    except limits.PlanLimitError as exc:
        raise InvitationError(exc.message) from exc

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
def accept_invitation(
    *,
    token: str,
    first_name: str,
    last_name: str,
    password: str | None,
    record_email: bool = True,
) -> User:
    """Public acceptance: the token is the credential (table exempt from RLS).

    With Google (decision 118) there is no password and allauth records the
    address Google verified, so ``record_email`` is off.
    """
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
    if record_email:
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


# --- Decision 120: the company resets a person's two-step verification -----

SECOND_FACTORS = ("totp", "webauthn", "recovery_codes")


@transaction.atomic
def reset_two_factor(*, user: User, by: User, note: str = "") -> int:
    """Doc 06 §6: whoever lost the phone and the backup codes is let back in
    by their company (a manager or administrator who knows them) or, for a
    lone administrator, by Cobradía's owner. Drops the authenticator app, the
    passkeys and the codes, closes every session of the person, writes the
    audit trail, tells the person by e-mail and the managers in the app. At
    the next sign-in the person sets it up again."""
    from allauth.mfa.models import Authenticator
    from allauth.usersessions.models import UserSession
    from django.conf import settings
    from django.contrib.sessions.models import Session

    from apps.audit.models import record_event
    from apps.notifications.models import Notification
    from apps.notifications.services import managers, notify

    removed = Authenticator.objects.filter(user=user, type__in=SECOND_FACTORS).delete()[0]
    keys = list(UserSession.objects.filter(user=user).values_list("session_key", flat=True))
    Session.objects.filter(session_key__in=keys).delete()
    UserSession.objects.filter(user=user).delete()

    who = by.get_full_name() or by.email
    owner = by.is_platform_admin and by.company_id != user.company_id
    origin = "el soporte de Cobradía" if owner else who
    name = user.get_full_name() or user.email
    with company_context(user.company_id):
        record_event(
            company_id=user.company_id,
            type="account.mfa_reset",
            target=user,
            actor=by,
            summary=f"{origin} restableció la verificación en dos pasos de {name}",
            data={"note": note[:300], "authenticators_removed": removed, "by_owner": owner},
        )
        notify(
            company_id=user.company_id,
            users=managers(exclude=by),
            kind=Notification.Kind.SECURITY,
            text=f"{origin} restableció la verificación en dos pasos de {name}. "
            "Al entrar, la configurará de nuevo.",
            link="/ajustes/usuarios",
        )
    transaction.on_commit(
        lambda: send_mail(
            subject="Tu verificación en dos pasos fue restablecida",
            message=(
                f"Hola, {user.first_name or user.email}.\n\n"
                f"{origin[0].upper()}{origin[1:]} restableció la verificación en dos pasos de "
                "tu cuenta de Cobradía: tu app autenticadora, tus llaves de acceso y tus códigos "
                "de respaldo ya no sirven, y tus sesiones abiertas se cerraron.\n\n"
                "Entra con tu contraseña y configúrala de nuevo desde Mi cuenta:\n"
                f"{settings.FRONTEND_URL}/entrar\n\n"
                "Si no pediste este cambio, avisa de inmediato a tu gerente.\n"
            ),
            from_email=None,
            recipient_list=[user.email],
        )
    )
    return removed
