from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.payments.api.views import (
    ApprovalViewSet,
    CollectView,
    DelinquencyView,
    PaymentPreviewView,
    PaymentScreenView,
    PaymentViewSet,
    PayoffLetterFileView,
    PayoffLetterView,
    PublicReceiptView,
)

router = DefaultRouter()
router.register("pagos", PaymentViewSet, basename="payment")
router.register("autorizaciones", ApprovalViewSet, basename="approval")

urlpatterns = [
    path("prestamos/<str:number>/cobro/", PaymentScreenView.as_view(), name="payment-screen"),
    path(
        "prestamos/<str:number>/cobro/simular/",
        PaymentPreviewView.as_view(),
        name="payment-preview",
    ),
    path("prestamos/<str:number>/cobrar/", CollectView.as_view(), name="payment-collect"),
    path("prestamos/<str:number>/carta-saldo/", PayoffLetterView.as_view(), name="payoff-letter"),
    path(
        "prestamos/<str:number>/carta-saldo/<uuid:letter_id>/",
        PayoffLetterFileView.as_view(),
        name="payoff-letter-file",
    ),
    path("atrasos/", DelinquencyView.as_view(), name="delinquency"),
    path("publico/recibos/<str:token>/", PublicReceiptView.as_view(), name="public-receipt"),
    path("", include(router.urls)),
]
