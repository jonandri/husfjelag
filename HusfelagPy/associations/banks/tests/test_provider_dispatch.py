import pytest
from unittest.mock import patch
from associations.models import Association, AssociationBankSettings
from associations.banks.dispatch import get_provider
from associations.banks.landsbankinn_provider import LandsbankinnProvider
from associations.banks.islandsbanki import IslandsbankiProvider

@pytest.mark.django_db
def test_get_provider_landsbankinn():
    a = Association.objects.create(ssn="1", name="L", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="landsbankinn")
    assert isinstance(get_provider(bs), LandsbankinnProvider)

@pytest.mark.django_db
def test_get_provider_islandsbanki():
    a = Association.objects.create(ssn="2", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki")
    assert isinstance(get_provider(bs), IslandsbankiProvider)

@pytest.mark.django_db
def test_landsbankinn_wrapper_delegates_create_claim():
    a = Association.objects.create(ssn="3", name="L", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="landsbankinn")
    with patch("associations.banks.landsbankinn.create_claim", return_value={"id": "X"}) as m:
        out = LandsbankinnProvider().create_claim("COLL", bs)
    m.assert_called_once_with("COLL", bs)
    assert out == {"id": "X"}

@pytest.mark.django_db
def test_landsbankinn_wrapper_adapts_status_signature():
    a = Association.objects.create(ssn="4", name="L", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="landsbankinn")
    bs.set_api_key("KEY"); bs.save()
    with patch("associations.banks.landsbankinn.get_claim_status", return_value="paid") as m:
        out = LandsbankinnProvider().get_claim_status("CID", bs)
    m.assert_called_once_with("CID", a.id, "KEY")
    assert out == "paid"
