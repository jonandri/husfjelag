import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from associations.models import Association, AssociationBankSettings, BankAccount, Transaction
from associations.banks.islandsbanki import IslandsbankiProvider


@pytest.mark.django_db
def test_sync_creates_and_dedupes_transactions():
    a = Association.objects.create(ssn="1000000000", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username="u")
    bs.set_isb_password("p"); bs.save()
    acc = BankAccount.objects.create(association=a, account_number="0133-26-000123", name="Aðal", is_connected=True)
    faerslur = [
        {"Hreyfingardagur": "2026-07-01T00:00:00", "Upphaed": "1000.00", "Tilvisunarnumer": "1234567890", "Sedilnumer": "1", "Textalykill": "Greiðsla", "Bunkanumer": "B1"},
        {"Hreyfingardagur": "2026-07-02T00:00:00", "Upphaed": "2000.00", "Tilvisunarnumer": "2345678901", "Sedilnumer": "2", "Textalykill": "Greiðsla", "Bunkanumer": "B2"},
    ]
    with patch("associations.banks.islandsbanki.isb_soap.invoke", return_value=faerslur) as inv:
        r1 = IslandsbankiProvider().sync_account_transactions(acc, date(2026,7,1), date(2026,7,31), bs)
    assert r1 == {"created": 2, "skipped": 0}
    assert Transaction.objects.filter(bank_account=acc).count() == 2
    assert inv.call_args.kwargs["banki"] == 133 and inv.call_args.kwargs["reikningsnumer"] == 123

    with patch("associations.banks.islandsbanki.isb_soap.invoke", return_value=faerslur):
        r2 = IslandsbankiProvider().sync_account_transactions(acc, date(2026,7,1), date(2026,7,31), bs)
    assert r2 == {"created": 0, "skipped": 2}          # composite external_id dedup
    assert Transaction.objects.filter(bank_account=acc).count() == 2


@pytest.mark.django_db
def test_discover_connects_valid_and_disconnects_invalid_isb_accounts():
    from associations.models import BankAccount
    a = Association.objects.create(ssn="1000000005", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username="u")
    good = BankAccount.objects.create(association=a, account_number="0133-26-000001", name="Good", is_connected=False)
    bad  = BankAccount.objects.create(association=a, account_number="0133-26-000002", name="Bad", is_connected=True)

    def fake_sync(account, from_date, to_date, settings):
        if account.account_number.endswith("000002"):
            raise RuntimeError("bank rejected")
        return {"created": 0, "skipped": 0}

    with patch.object(IslandsbankiProvider, "sync_account_transactions", side_effect=fake_sync):
        result = IslandsbankiProvider().discover_and_sync_accounts(a, bs)

    good.refresh_from_db(); bad.refresh_from_db()
    assert good.is_connected is True      # manual account validated → connected
    assert bad.is_connected is False      # failing account → disconnected
    assert result == {"created": 0, "connected": 1, "disconnected": 1}


@pytest.mark.django_db
def test_get_claim_status_reconstructs_key():
    a = Association.objects.create(ssn="1000000001", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username="u")
    with patch("associations.banks.islandsbanki.isb_soap.invoke", return_value={"Stada": "GREIDD"}) as inv:
        out = IslandsbankiProvider().get_claim_status("133:66:4567:2026-07-31", bs)
    assert out == "paid"
    assert inv.call_args.kwargs["banki"] == 133
    assert inv.call_args.kwargs["hofudbok"] == 66
    assert inv.call_args.kwargs["krofunumer"] == 4567

@pytest.mark.django_db
def test_list_claims_normalizes_rows():
    a = Association.objects.create(ssn="1000000002", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username="u")
    rows = [{"KennitalaGreidanda": "2345678901", "Gjalddagi": "2026-07-31T00:00:00", "Upphaed": "1000.00", "Stada": "ógreidd", "Tilvisun": "ref"}]
    with patch("associations.banks.islandsbanki.isb_soap.invoke", return_value=rows):
        out = IslandsbankiProvider().list_claims(a, bs)
    assert out[0]["amount"] == 1000.0 and out[0]["status"] == "UNPAID" and out[0]["payer_kennitala"] == "2345678901"


@pytest.mark.django_db
def test_create_claim_returns_id_without_persisting(django_user_model):
    from associations.models import Budget, Apartment, Collection, BankClaim
    from users.models import User
    from decimal import Decimal
    a = Association.objects.create(ssn="1000000000", name="I", address="A", postal_code="101", city="Rvk")
    bs = AssociationBankSettings.objects.create(association=a, bank="islandsbanki", isb_username="u", isb_claim_account="0133-66-000001")
    payer = User.objects.create(kennitala="2345678901", name="Payer")
    budget = Budget.objects.create(association=a, year=2026)
    apt = Apartment.objects.create(association=a, anr="01", fnr="F1")
    coll = Collection.objects.create(budget=budget, apartment=apt, payer=payer, month=7,
                                     amount_total=Decimal("15000.00"), amount_shared=Decimal("15000.00"), amount_equal=Decimal("0.00"))
    with patch("associations.banks.islandsbanki.isb_soap.invoke", return_value=None) as inv:
        out = IslandsbankiProvider().create_claim(coll, bs)
    assert inv.call_args.args[1] == "krofur" and inv.call_args.args[2] == "StofnaKrofu"
    assert inv.call_args.kwargs["krafa"]["Krofunumer"] == coll.id
    assert out == {"id": f"133:66:{coll.id}:2026-07-31"}
    assert not BankClaim.objects.filter(collection=coll).exists()   # provider does not persist; the view does
