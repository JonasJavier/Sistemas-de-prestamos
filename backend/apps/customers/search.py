"""Accent-insensitive customer search, shared by the list and Ctrl+K."""

from django.db.models import Q, QuerySet, Value
from django.db.models.functions import Concat

from apps.customers.models import Customer
from apps.customers.validators import clean_document


def search_customers(q: str, queryset: QuerySet[Customer] | None = None) -> QuerySet[Customer]:
    base = queryset if queryset is not None else Customer.objects.all()
    q = q.strip()
    if not q:
        return base
    return base.annotate(
        full_name=Concat("first_name", Value(" "), "last_name", Value(" "), "legal_name")
    ).filter(
        Q(full_name__unaccent__icontains=q)
        | Q(document_number__icontains=clean_document(q))
        | Q(phone__icontains=q)
    )
