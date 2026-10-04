from django.contrib import admin

from apps.core.models import (
    Branch,
    Company,
    Holiday,
    Municipality,
    Province,
    Reason,
    Sector,
    Sequence,
)


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["legal_name", "trade_name", "status", "trial_ends_on", "created_at"]
    list_filter = ["status"]
    search_fields = ["legal_name", "trade_name", "rnc"]


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "company", "is_active"]


admin.site.register([Holiday, Reason, Sequence, Province, Municipality, Sector])
