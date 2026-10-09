"""The visitor's address behind our own proxy (decision 102).

In production Caddy sits in front of Gunicorn, so REMOTE_ADDR is Caddy's.
Only the hops we control are trusted (TRUSTED_PROXY_COUNT): the address the
last of them appended to X-Forwarded-For is the client's; anything a
visitor writes in that header before it is ignored. The same count feeds
DRF's throttles and allauth's login limits.
"""

import ipaddress

from django.conf import settings
from django.http import HttpRequest


def client_ip(request: HttpRequest) -> str | None:
    count = settings.TRUSTED_PROXY_COUNT
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if count and forwarded:
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        if len(hops) >= count:
            try:
                return str(ipaddress.ip_address(hops[-count]))
            except ValueError:
                pass
    return request.META.get("REMOTE_ADDR") or None
