from celery import shared_task
from django.utils import timezone

from apps.core.tenancy import company_context


@shared_task
def deliver_message(company_id: str, message_id: str) -> str:
    """Hands one recorded message to its channel's provider (decision 097)."""
    from apps.notifications import providers
    from apps.notifications.models import OutboundMessage

    with company_context(company_id):
        message = OutboundMessage.objects.get(pk=message_id)
        if message.status != OutboundMessage.Status.QUEUED:
            return message.status
        result = providers.deliver(message)
        message.status = result.status
        message.provider = result.provider
        message.provider_ref = result.ref
        message.error = result.error
        if result.status in (OutboundMessage.Status.SENT, OutboundMessage.Status.LOGGED):
            message.sent_at = timezone.now()
        message.save(
            update_fields=["status", "provider", "provider_ref", "error", "sent_at", "updated_at"]
        )
        return message.status
