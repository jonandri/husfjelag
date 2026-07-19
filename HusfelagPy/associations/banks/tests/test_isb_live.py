import os, pytest
pytestmark = pytest.mark.skipif(
    not os.environ.get("ISB_TEST_USER"), reason="Íslandsbanki sandbox creds not configured"
)


@pytest.mark.django_db
def test_live_saekjareikningsyfirlit_signs_and_returns():
    from associations.models import Association, AssociationBankSettings, BankAccount
    from associations.banks.islandsbanki import IslandsbankiProvider
    from datetime import date
    ssn = os.environ["ISB_TEST_SSN"].replace("-", "")  # kennitala: hyphens stripped before storage
    a = Association.objects.create(ssn=ssn, name="Live", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username=os.environ["ISB_TEST_USER"])
    bs.set_isb_password(os.environ["ISB_TEST_PWD"]); bs.save()
    acc = BankAccount.objects.create(association=a, account_number=os.environ["ISB_TEST_ACCOUNT"], name="Live", is_connected=True)
    result = IslandsbankiProvider().sync_account_transactions(acc, date(2026, 1, 1), date.today(), bs)
    assert set(result) == {"created", "skipped"}      # a signed call was accepted (no SOAP fault)
