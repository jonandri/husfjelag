import pytest
from associations.models import Association, AssociationBankSettings

@pytest.mark.django_db
def test_isb_password_roundtrip_and_encrypted():
    a = Association.objects.create(ssn="1234567890", name="Test", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki",
                                                isb_username="user1", isb_claim_account="0133-26-000001")
    bs.set_isb_password("s3cret")
    bs.save()
    bs.refresh_from_db()
    assert bs.get_isb_password() == "s3cret"
    assert bs.isb_password != "s3cret"          # stored encrypted
    assert bs.isb_username == "user1"
    assert bs.isb_claim_account == "0133-26-000001"

@pytest.mark.django_db
def test_isb_password_empty_returns_blank():
    a = Association.objects.create(ssn="1234567891", name="T2", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a)
    assert bs.get_isb_password() == ""
