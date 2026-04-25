import pytest
from decimal import Decimal
from unittest.mock import patch


@pytest.mark.django_db
def test_create_claim_builds_correct_payload():
    """create_claim() sends a POST with correct due_date and principalAmount."""
    from associations.models import (
        Association, Apartment, Budget, Collection, CollectionStatus,
        AssociationBankSettings,
    )
    from users.models import User

    assoc = Association.objects.create(
        ssn="5555555555", name="BA", address="A", postal_code="100", city="RVK"
    )
    payer = User.objects.create(kennitala="6666666666", name="Owner")
    budget = Budget.objects.create(association=assoc, year=2026, is_active=True)
    apartment = Apartment.objects.create(
        association=assoc, fnr="12345678", anr="0101",
        share=Decimal("100.00"), share_eq=Decimal("100.00"),
    )
    collection = Collection.objects.create(
        budget=budget,
        apartment=apartment,
        payer=payer,
        month=4,
        amount_shared=Decimal("5000.00"),
        amount_equal=Decimal("0.00"),
        amount_total=Decimal("5000.00"),
        status=CollectionStatus.PENDING,
    )
    settings_obj = AssociationBankSettings.objects.create(
        association=assoc, template_id="TPL-999"
    )

    captured_body = {}

    def fake_post(path, body):
        captured_body.update(body)
        return {"id": "CLAIM-ABC123", "status": "unpaid"}

    from associations.banks import landsbankinn
    with patch.object(landsbankinn, "_post", side_effect=fake_post):
        result = landsbankinn.create_claim(collection, settings_obj)

    assert result["id"] == "CLAIM-ABC123"
    assert captured_body["templateId"] == "TPL-999"
    assert captured_body["payorNationalId"] == "6666666666"
    assert captured_body["principalAmount"] == 5000.0
    assert captured_body["dueDate"] == "2026-04-30"  # last day of April 2026
    assert captured_body["description"] == "Húsfélagsgjald 04/2026"
    assert captured_body["secondaryCollection"]["collectionCompanyNationalId"] == "5555555555"
