from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.api.views import (
    CompanyUserViewSet,
    InvitationAcceptView,
    InvitationCreateView,
    InvitationPublicView,
    MeView,
    PendingInvitationsView,
    RoleListView,
)

router = DefaultRouter()
router.register("usuarios", CompanyUserViewSet, basename="company-user")

urlpatterns = [
    path("yo/", MeView.as_view(), name="me"),
    path("roles/", RoleListView.as_view(), name="role-list"),
    path(
        "invitaciones/pendientes/",
        PendingInvitationsView.as_view(),
        name="invitation-pending",
    ),
    path(
        "invitaciones/pendientes/<uuid:pk>/",
        PendingInvitationsView.as_view(),
        name="invitation-revoke",
    ),
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
    path("", include(router.urls)),
]
