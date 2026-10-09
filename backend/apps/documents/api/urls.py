from django.urls import path

from apps.documents.api.views import VerifyView

urlpatterns = [
    path("publico/verificar/<str:token>/", VerifyView.as_view(), name="public-verify"),
]
