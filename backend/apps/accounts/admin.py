from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import ApprovalLimit, Invitation, Membership, Role, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "company", "is_platform_admin", "is_active"]
    list_filter = ["is_platform_admin", "is_active"]
    search_fields = ["email", "first_name", "last_name"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Datos", {"fields": ("first_name", "last_name", "phone", "company")}),
        ("Acceso", {"fields": ("is_active", "is_staff", "is_superuser", "is_platform_admin")}),
        ("Fechas", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),)


admin.site.register([Role, Membership, ApprovalLimit, Invitation])
