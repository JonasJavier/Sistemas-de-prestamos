from django.contrib import admin

from apps.platform.models import Plan, Subscription, SubscriptionPayment, SupportAccessGrant


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ["name", "monthly_price", "max_users", "max_branches", "is_trial", "is_active"]


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["company", "plan", "status", "started_on", "paid_until"]
    list_filter = ["status"]


admin.site.register([SubscriptionPayment, SupportAccessGrant])
