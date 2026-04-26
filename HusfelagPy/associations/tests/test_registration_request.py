import pytest
from rest_framework.test import APIClient
from users.models import User
from associations.models import RegistrationRequest


@pytest.fixture
def superadmin(db):
    return User.objects.create(
        kennitala="0000000001", name="Admin", email="admin@test.is",
        phone="111 1111", is_superadmin=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create(
        kennitala="0000000002", name="User", email="user@test.is",
        phone="222 2222", is_superadmin=False,
    )


@pytest.fixture
def auth_client(regular_user):
    client = APIClient()
    client.force_authenticate(user=regular_user)
    return client, regular_user


@pytest.fixture
def admin_client(superadmin):
    client = APIClient()
    client.force_authenticate(user=superadmin)
    return client, superadmin


VALID_PAYLOAD = {
    "assoc_ssn": "5512131230",
    "assoc_name": "Húsfélag Brekku 5",
    "chair_ssn": "1234567890",
    "chair_name": "Jón Jónsson",
    "chair_email": "jon@test.is",
    "chair_phone": "123 4567",
}


def test_create_registration_request(auth_client):
    client, user = auth_client
    resp = client.post("/RegistrationRequest", VALID_PAYLOAD, format="json")
    assert resp.status_code == 201
    assert RegistrationRequest.objects.filter(submitted_by=user).count() == 1


def test_create_requires_auth(db):
    client = APIClient()
    resp = client.post("/RegistrationRequest", VALID_PAYLOAD, format="json")
    assert resp.status_code == 401


def test_create_validates_ssn_length(auth_client):
    client, _ = auth_client
    payload = {**VALID_PAYLOAD, "assoc_ssn": "123"}
    resp = client.post("/RegistrationRequest", payload, format="json")
    assert resp.status_code == 400


def test_admin_list_pending(admin_client, regular_user, db):
    client, _ = admin_client
    RegistrationRequest.objects.create(
        submitted_by=regular_user, **VALID_PAYLOAD
    )
    resp = client.get("/admin/RegistrationRequest")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["assoc_ssn"] == "5512131230"


def test_admin_list_requires_superadmin(auth_client):
    client, _ = auth_client
    resp = client.get("/admin/RegistrationRequest")
    assert resp.status_code == 403


def test_admin_mark_reviewed(admin_client, regular_user, db):
    client, _ = admin_client
    req = RegistrationRequest.objects.create(submitted_by=regular_user, **VALID_PAYLOAD)
    resp = client.patch(f"/admin/RegistrationRequest/{req.id}", {"status": "REVIEWED"}, format="json")
    assert resp.status_code == 200
    req.refresh_from_db()
    assert req.status == "REVIEWED"
