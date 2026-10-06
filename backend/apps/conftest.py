"""A tenant with one user per role, a funded cash box and a customer.

Service-level tests run inside ``company_context`` (RLS needs the tenant);
API tests go through the middleware like production.
"""

from dataclasses import dataclass
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, Role, User
from apps.core.models import Branch
from apps.core.tenancy import company_context
from apps.customers.models import Customer
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount
from apps.lending.models import LoanProduct
from apps.platform.services import RegistrationResult, register_company


@dataclass
class Tenant:
    reg: RegistrationResult
    users: dict[str, User]
    branch: Branch
    cash: FinancialAccount
    customer: Customer

    @property
    def company(self):
        return self.reg.company

    def client(self, role: str) -> APIClient:
        api = APIClient()
        api.force_login(self.users[role])
        return api

    def product(self, name: str) -> LoanProduct:
        with company_context(self.company.id):
            return LoanProduct.objects.get(name=name)


def add_user(reg: RegistrationResult, email: str, *roles: str, branch=None) -> User:
    user = User.objects.create_user(
        email, "una-clave-larga-123", company=reg.company, first_name=email.split("@")[0]
    )
    with company_context(reg.company.id):
        for role in roles:
            Membership.objects.create(
                company=reg.company,
                user=user,
                branch=branch or reg.branch,
                role=Role.objects.get(name=role),
            )
    return user


def make_customer(company, branch, document: str, first_name: str = "María") -> Customer:
    return Customer.objects.create(
        company=company,
        kind=Customer.Kind.PERSON,
        document_type=Customer.DocumentType.CEDULA,
        document_number=document,
        first_name=first_name,
        last_name="Gómez",
        phone="8095551234",
        home_branch=branch,
    )


def build_tenant(name: str, email_domain: str) -> Tenant:
    reg = register_company(
        legal_name=name,
        admin_email=f"gerente@{email_domain}",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )
    users = {
        "gerente": reg.admin,
        "gerente2": add_user(reg, f"gerente2@{email_domain}", "Gerente"),
        "supervisor": add_user(reg, f"supervisor@{email_domain}", "Supervisor"),
        "oficial": add_user(reg, f"oficial@{email_domain}", "Oficial de crédito"),
        "cajero": add_user(reg, f"cajero@{email_domain}", "Cajero"),
        "contabilidad": add_user(reg, f"conta@{email_domain}", "Contabilidad"),
        "cobrador": add_user(reg, f"cobrador@{email_domain}", "Cobrador"),
    }
    with company_context(reg.company.id):
        cash = FinancialAccount.objects.get(kind=FinancialAccount.Kind.CASH)
        ledger.capital_movement(
            account=cash,
            amount=Decimal("500000"),
            increase=True,
            branch=reg.branch,
            on=timezone.localdate(),
            note="Fondo inicial",
            created_by=reg.admin,
        )
        customer = make_customer(reg.company, reg.branch, "00112345674")
    return Tenant(reg=reg, users=users, branch=reg.branch, cash=cash, customer=customer)


@pytest.fixture
def tenant(db) -> Tenant:
    return build_tenant("Financiera Uno SRL", "uno.do")


@pytest.fixture
def other_tenant(db) -> Tenant:
    return build_tenant("Financiera Dos SRL", "dos.do")
