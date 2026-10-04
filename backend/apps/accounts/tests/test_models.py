import pytest
from django.db import IntegrityError

from apps.accounts.models import User
from apps.core.models import Company


@pytest.fixture
def company(db) -> Company:
    return Company.objects.create(legal_name="Financiera Uno SRL")


def test_create_user_with_company(company: Company) -> None:
    user = User.objects.create_user("gerente@uno.do", "una-clave-larga-123", company=company)
    assert user.check_password("una-clave-larga-123")
    assert user.company == company
    assert not user.is_platform_admin


def test_user_without_company_must_be_platform_admin(db) -> None:
    with pytest.raises(IntegrityError):
        User.objects.create_user("suelto@nadie.do", "una-clave-larga-123")


def test_create_superuser_is_platform_admin(db) -> None:
    owner = User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123")
    assert owner.is_platform_admin
    assert owner.company is None


def test_email_unique_across_platform(company: Company) -> None:
    User.objects.create_user("unico@uno.do", "una-clave-larga-123", company=company)
    with pytest.raises(IntegrityError):
        User.objects.create_user("unico@uno.do", "otra-clave-larga-456", company=company)
