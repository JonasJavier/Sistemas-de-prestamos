from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.customers.api.views import CustomerViewSet

router = DefaultRouter()
router.register("clientes", CustomerViewSet, basename="customer")

urlpatterns = [path("", include(router.urls))]
