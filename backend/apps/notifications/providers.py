"""Who delivers each channel (decision 097). E-mail: the mail server.
WhatsApp and SMS: the provider set in ``MESSAGING_PROVIDERS`` — «twilio»
once contracted (credentials in the environment), else «registro»: the
message is recorded but not sent."""

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from django.conf import settings
from django.core.mail import EmailMessage

from apps.notifications.models import Channel, OutboundMessage

TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


@dataclass(frozen=True)
class Result:
    status: str
    provider: str
    ref: str = ""
    error: str = ""


def _provider(channel: str) -> str:
    return settings.MESSAGING_PROVIDERS.get(channel, "registro")


def status(channel: str) -> dict:
    provider = _provider(channel)
    ready = provider == "twilio" and bool(
        settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and _twilio_from(channel)
    )
    return {"provider": provider, "ready": ready}


def _twilio_from(channel: str) -> str:
    return (
        settings.TWILIO_FROM_WHATSAPP if channel == Channel.WHATSAPP else settings.TWILIO_FROM_SMS
    )


def _twilio(message: OutboundMessage) -> Result:
    channel = message.channel
    prefix = "whatsapp:" if channel == Channel.WHATSAPP else ""
    data = urllib.parse.urlencode(
        {
            "To": f"{prefix}{message.to}",
            "From": f"{prefix}{_twilio_from(channel)}",
            "Body": message.body,
        }
    ).encode()
    request = urllib.request.Request(  # noqa: S310 - a fixed https URL, never user input
        TWILIO_URL.format(sid=settings.TWILIO_ACCOUNT_SID), data=data, method="POST"
    )
    token = base64.b64encode(
        f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}".encode()
    ).decode()
    request.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed https URL
            payload = json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        return Result(OutboundMessage.Status.FAILED, "twilio", error=f"{exc.code}: {detail}")
    except (urllib.error.URLError, TimeoutError) as exc:
        return Result(OutboundMessage.Status.FAILED, "twilio", error=str(exc)[:200])
    return Result(OutboundMessage.Status.SENT, "twilio", ref=str(payload.get("sid", "")))


def deliver(message: OutboundMessage) -> Result:
    if message.channel == Channel.EMAIL:
        try:
            EmailMessage(
                subject=message.subject or "Mensaje",
                body=message.body,
                to=[message.to],
            ).send()
        except Exception as exc:  # noqa: BLE001 - the mail server's error, recorded
            return Result(OutboundMessage.Status.FAILED, "correo", error=str(exc)[:200])
        return Result(OutboundMessage.Status.SENT, "correo")
    if status(message.channel)["ready"]:
        return _twilio(message)
    return Result(OutboundMessage.Status.LOGGED, "registro")
