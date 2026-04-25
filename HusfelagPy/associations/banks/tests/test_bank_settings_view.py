import json
import pytest
from rest_framework.test import APIClient
from associations.models import Association, AssociationAccess, AssociationRole
from users.models import User
from users.oidc import create_access_token


@pytest.fixture
def chair_user(db):
    return User.objects.create(
        kennitala="1111111111", name="Chair", email="chair@test.is"
    )


@pytest.fixture
def association(db):
    return Association.objects.create(
        ssn="2222222222", name="Test BA", address="Test st", postal_code="100", city="Reykjavik"
    )


@pytest.fixture
def chair_access(db, chair_user, association):
    AssociationAccess.objects.create(
        user=chair_user, association=association, role=AssociationRole.CHAIR, active=True
    )


@pytest.fixture
def chair_client(chair_user):
    token = create_access_token(chair_user.id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.mark.django_db
def test_get_settings_returns_404_when_not_configured(chair_client, association, chair_access):
    resp = chair_client.get(f"/associations/{association.id}/bank/settings")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_post_settings_creates_template_id(chair_client, association, chair_access):
    resp = chair_client.post(
        f"/associations/{association.id}/bank/settings",
        data=json.dumps({"template_id": "TPL-123"}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["template_id"] == "TPL-123"


@pytest.mark.django_db
def test_post_settings_updates_existing(chair_client, association, chair_access):
    chair_client.post(
        f"/associations/{association.id}/bank/settings",
        data=json.dumps({"template_id": "TPL-123"}),
        content_type="application/json",
    )
    resp = chair_client.post(
        f"/associations/{association.id}/bank/settings",
        data=json.dumps({"template_id": "TPL-456"}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert resp.json()["template_id"] == "TPL-456"
