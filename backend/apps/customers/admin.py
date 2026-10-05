from django.contrib import admin

from apps.customers.models import (
    Business,
    Collateral,
    CollateralFile,
    Customer,
    CustomerFile,
    Employment,
    PropertyDetail,
    Reference,
    Relative,
    VehicleDetail,
)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["document_number", "display_name", "kind", "status", "company"]
    list_filter = ["kind", "status"]
    search_fields = ["document_number", "first_name", "last_name", "legal_name"]


admin.site.register(
    [
        Employment,
        Business,
        Relative,
        Reference,
        CustomerFile,
        Collateral,
        VehicleDetail,
        PropertyDetail,
        CollateralFile,
    ]
)
