from django.urls import path

from apps.accounts.api.views import (
    InvitationAcceptView,
    InvitationCreateView,
    InvitationPublicView,
)

urlpatterns = [
    path("invitaciones/", InvitationCreateView.as_view(), name="invitation-create"),
    path(
        "invitaciones/<str:token>/",
        InvitationPublicView.as_view(),
        name="invitation-detail",
    ),
    path(
        "invitaciones/<str:token>/aceptar/",
        InvitationAcceptView.as_view(),
        name="invitation-accept",
    ),
]
