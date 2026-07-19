import pytest
from unittest.mock import patch
from associations.models import Association, AssociationBankSettings


@pytest.mark.django_db
def test_sync_task_skips_isb_without_credentials():
    from associations.banks.tasks import sync_transactions
    a = Association.objects.create(ssn="1000000006", name="I", address="A", postal_code="101", city="Rvk")
    AssociationBankSettings.objects.create(association=a, bank="islandsbanki")  # no username/password
    out = sync_transactions(a.id)
    assert out.get("reason") == "isb_credentials_missing"


@pytest.mark.django_db
def test_sync_task_runs_discovery_for_isb_with_credentials():
    from associations.banks.tasks import sync_transactions
    a = Association.objects.create(ssn="1000000007", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username="u")
    bs.set_isb_password("p"); bs.save()
    with patch("associations.banks.tasks.get_provider") as gp:
        gp.return_value.discover_and_sync_accounts.return_value = {"created": 0, "connected": 0, "disconnected": 0}
        out = sync_transactions(a.id)
    # It got past the credential guard and invoked discovery (did NOT return isb_credentials_missing)
    assert out.get("reason") != "isb_credentials_missing"
    gp.return_value.discover_and_sync_accounts.assert_called_once()
