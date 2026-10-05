from django.contrib import admin

from apps.lending.models import LateFeePolicy, LoanProduct, ProductCharge


@admin.register(LoanProduct)
class LoanProductAdmin(admin.ModelAdmin):
    list_display = ["name", "type", "method", "company", "is_active"]
    list_filter = ["type", "is_active"]


admin.site.register([LateFeePolicy, ProductCharge])
