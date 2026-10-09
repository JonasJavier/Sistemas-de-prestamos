"""P80 «Mensajería» and the customer's messages (F18, decision 097)."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.audit.models import record_event
from apps.core.api.pagination import Pagination
from apps.core.models import PublicLink
from apps.customers.access import scope_customers
from apps.customers.models import Customer
from apps.notifications import messaging
from apps.notifications.models import (
    Channel,
    MessageEvent,
    MessageTemplate,
    OptOut,
    OutboundMessage,
)

CanManage = role_required(
    authz.GERENTE, authz.ADMINISTRADOR, read_any=False, read_roles=(authz.AUDITORIA,)
)
CanServe = role_required(
    authz.GERENTE,
    authz.SUPERVISOR,
    authz.OFICIAL,
    authz.CAJERO,
    authz.COBRADOR,
    read_any=False,
    read_roles=(authz.AUDITORIA,),
)
VARIABLES = ["nombre", "monto", "fecha", "prestamo", "empresa", "enlace", "codigo"]


def _template(t: MessageTemplate) -> dict:
    return {
        "id": str(t.id),
        "event": t.event,
        "event_label": t.get_event_display(),
        "channel": t.channel,
        "channel_label": t.get_channel_display(),
        "subject": t.subject,
        "body": t.body,
        "is_active": t.is_active,
    }


def _message(m: OutboundMessage) -> dict:
    return {
        "id": str(m.id),
        "event": m.event,
        "event_label": m.get_event_display(),
        "channel": m.channel,
        "channel_label": m.get_channel_display(),
        "to": m.to,
        "subject": m.subject,
        "body": m.body,
        "status": m.status,
        "status_label": m.get_status_display(),
        "provider": m.provider,
        "error": m.error,
        "customer": None
        if m.customer_id is None
        else {"id": str(m.customer_id), "name": m.customer.display_name},
        "loan": m.loan.number if m.loan_id else None,
        "created_at": m.created_at,
        "sent_at": m.sent_at,
    }


class TemplatesView(APIView):
    permission_classes = [CanManage]

    def get(self, request: Request) -> Response:
        return Response(
            {
                "templates": [_template(t) for t in messaging.templates()],
                "variables": VARIABLES,
                "providers": messaging.provider_status(),
            }
        )


class TemplateDetailView(APIView):
    permission_classes = [CanManage]

    def patch(self, request: Request, pk) -> Response:
        template = get_object_or_404(MessageTemplate, pk=pk)
        for key in ("subject", "body"):
            if key in request.data:
                setattr(template, key, str(request.data[key]))
        if "is_active" in request.data:
            template.is_active = bool(request.data["is_active"])
        if not template.body.strip():
            raise ValidationError({"body": "El mensaje no puede quedar vacío."})
        if template.channel == Channel.SMS and len(template.body) > 480:
            raise ValidationError({"body": "Un SMS largo se corta: hasta 480 caracteres."})
        template.save()
        return Response(_template(template))


class LogView(APIView):
    permission_classes = [CanManage]

    def get(self, request: Request) -> Response:
        rows = OutboundMessage.objects.select_related("customer", "loan").order_by("-created_at")
        for key, field in (("canal", "channel"), ("estado", "status"), ("evento", "event")):
            if request.query_params.get(key):
                rows = rows.filter(**{field: request.query_params[key]})
        paginator = Pagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response([_message(m) for m in page])


class TestView(APIView):
    """«Mensajes de prueba llegan y quedan registrados» (doc 10, phase 9)."""

    permission_classes = [CanManage]

    def post(self, request: Request) -> Response:
        channel = str(request.data.get("channel", ""))
        to = str(request.data.get("to", "")).strip()
        if channel not in Channel.values or not to:
            raise ValidationError({"to": "Indica el canal y a quién enviarlo."})
        sent = messaging.send(
            event=MessageEvent.TEST,
            context={},
            channels=[channel],
            to=to,
            created_by=request.user,
        )
        if not sent:
            raise ValidationError({"channel": "La plantilla de prueba de ese canal está apagada."})
        sent[0].refresh_from_db()
        return Response(_message(sent[0]), status=status.HTTP_201_CREATED)


def _channel_text(channel: str, every: str) -> str:
    return Channel(channel).label if channel else every


def _customer(request: Request, pk) -> Customer:
    return get_object_or_404(scope_customers(Customer.objects.all(), request.user), pk=pk)


class CustomerMessagesView(APIView):
    permission_classes = [CanServe]

    def get(self, request: Request, pk) -> Response:
        customer = _customer(request, pk)
        messages = customer.messages.select_related("loan").order_by("-created_at")[:100]
        portal = (
            PublicLink.objects.filter(
                tenant=customer.company_id,
                kind=PublicLink.Kind.PORTAL,
                object_id=customer.id,
                revoked_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        return Response(
            {
                "messages": [_message(m) for m in messages],
                # Decision 099: since when the customer can enter the portal.
                "portal_since": portal.created_at if portal else None,
                "opt_outs": [
                    {
                        "channel": o.channel,
                        "channel_label": o.get_channel_display() if o.channel else "Todos",
                        "reason": o.reason,
                        "created_at": o.created_at,
                    }
                    for o in customer.opt_outs.all()
                ],
            }
        )


class OptOutView(APIView):
    """The customer asked not to be written to (or to be written again)."""

    permission_classes = [CanServe]

    def post(self, request: Request, pk) -> Response:
        customer = _customer(request, pk)
        channel = str(request.data.get("channel", ""))
        if channel not in ["", *Channel.values]:
            raise ValidationError({"channel": "Canal inválido."})
        OptOut.objects.get_or_create(
            company_id=customer.company_id,
            customer=customer,
            channel=channel,
            defaults={
                "reason": str(request.data.get("reason", ""))[:200],
                "created_by": request.user,
            },
        )
        record_event(
            company_id=customer.company_id,
            type="customer.opt_out",
            target=customer,
            actor=request.user,
            summary=f"No quiere recibir mensajes por {_channel_text(channel, 'ningún canal')}",
        )
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request: Request, pk) -> Response:
        customer = _customer(request, pk)
        channel = str(request.query_params.get("canal", ""))
        removed, _ = OptOut.objects.filter(customer=customer, channel=channel).delete()
        if removed:
            record_event(
                company_id=customer.company_id,
                type="customer.opt_in",
                target=customer,
                actor=request.user,
                summary=f"Vuelve a recibir mensajes por {_channel_text(channel, 'todos')}",
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
