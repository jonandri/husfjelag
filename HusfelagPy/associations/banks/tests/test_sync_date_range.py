import pytest
from datetime import date
from unittest.mock import patch


@pytest.mark.django_db
def test_sync_uses_one_day_before_last_transaction():
    """When transactions exist, from_date = last_tx_date - 1 day."""
    from associations.models import (
        Association, BankAccount, Transaction, TransactionSource
    )

    assoc = Association.objects.create(
        ssn="1234567890", name="Test BA", address="Test st", postal_code="100", city="Reykjavik"
    )
    account = BankAccount.objects.create(
        association=assoc, name="Main", account_number="0101010101"
    )
    Transaction.objects.create(
        bank_account=account,
        date=date(2026, 3, 15),
        amount="1000",
        description="Test tx",
        source=TransactionSource.BANK_SYNC,
    )

    captured = {}

    def fake_sync(account_arg, from_date, to_date):
        captured["from_date"] = from_date
        captured["to_date"] = to_date
        return {"created": 0, "skipped": 0}

    from associations.banks import tasks
    with patch.object(tasks, "sync_account_transactions", side_effect=fake_sync):
        tasks.sync_transactions(assoc.id)

    assert captured["from_date"] == date(2026, 3, 14)  # one day before last tx


@pytest.mark.django_db
def test_sync_uses_jan_1_for_first_sync():
    """When no transactions exist, from_date = January 1st of current year."""
    from associations.models import Association, BankAccount

    assoc = Association.objects.create(
        ssn="9876543210", name="Empty BA", address="Test st", postal_code="100", city="Reykjavik"
    )
    BankAccount.objects.create(
        association=assoc, name="Main", account_number="0202020202"
    )

    captured = {}

    def fake_sync(account_arg, from_date, to_date):
        captured["from_date"] = from_date
        return {"created": 0, "skipped": 0}

    from associations.banks import tasks
    with patch.object(tasks, "sync_account_transactions", side_effect=fake_sync):
        tasks.sync_transactions(assoc.id)

    today = date.today()
    assert captured["from_date"] == date(today.year, 1, 1)
