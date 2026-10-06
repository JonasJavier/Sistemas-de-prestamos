from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.api.views import csrf

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/csrf/", csrf, name="csrf"),
    path("api/v1/", include("apps.platform.api.urls")),
    path("api/v1/", include("apps.accounts.api.urls")),
    path("api/v1/", include("apps.core.api.urls")),
    path("api/v1/", include("apps.customers.api.urls")),
    path("api/v1/", include("apps.lending.api.urls")),
    path("api/v1/", include("apps.ledger.api.urls")),
    path("api/v1/auth/", include("allauth.headless.urls")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/v1/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="api-docs",
    ),
]
