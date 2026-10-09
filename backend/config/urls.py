from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.api.views import csrf, health

urlpatterns = [
    path("api/v1/csrf/", csrf, name="csrf"),
    path("api/v1/salud/", health, name="health"),
    path("api/v1/", include("apps.platform.api.urls")),
    path("api/v1/", include("apps.accounts.api.urls")),
    path("api/v1/", include("apps.core.api.urls")),
    path("api/v1/", include("apps.customers.api.urls")),
    path("api/v1/", include("apps.lending.api.urls")),
    path("api/v1/", include("apps.ledger.api.urls")),
    path("api/v1/", include("apps.expenses.api.urls")),
    path("api/v1/", include("apps.payments.api.urls")),
    path("api/v1/", include("apps.cash.api.urls")),
    path("api/v1/", include("apps.collections.api.urls")),
    path("api/v1/", include("apps.notifications.api.urls")),
    path("api/v1/", include("apps.reports.api.urls")),
    path("api/v1/", include("apps.audit.api.urls")),
    path("api/v1/", include("apps.documents.api.urls")),
    path("api/v1/auth/", include("allauth.headless.urls")),
]

# Decision 101: Django's admin (no 2FA) and the API schema stay out of
# production unless switched on explicitly.
if settings.ADMIN_ENABLED:
    urlpatterns.append(path("admin/", admin.site.urls))
if settings.API_DOCS:
    urlpatterns += [
        path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/v1/docs/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="api-docs",
        ),
    ]
