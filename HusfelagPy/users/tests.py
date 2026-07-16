import base64
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.test import TestCase, override_settings

from . import oidc
from .models import User


@override_settings(
    OIDC_CLIENT_ID="husfjelag-web",
    OIDC_CLIENT_SECRET="s3cret",
    OIDC_ISSUER="https://id.husfjelag.is",
    OIDC_AUTH_ENDPOINT="https://id.husfjelag.is/auth",
    OIDC_TOKEN_ENDPOINT="https://id.husfjelag.is/token",
    OIDC_JWKS_URI="https://id.husfjelag.is/jwks",
    OIDC_REDIRECT_URI="https://api.husfjelag.is/auth/callback",
)
class BuildAuthUrlTests(TestCase):
    def test_params_and_scope(self):
        url = oidc.build_auth_url(state="st4te", code_challenge="chall")
        parsed = urlparse(url)
        self.assertEqual(f"{parsed.scheme}://{parsed.netloc}{parsed.path}",
                         "https://id.husfjelag.is/auth")
        q = parse_qs(parsed.query)
        self.assertEqual(q["scope"], ["openid profile national_id phone"])
        self.assertEqual(q["client_id"], ["husfjelag-web"])
        self.assertEqual(q["redirect_uri"], ["https://api.husfjelag.is/auth/callback"])
        self.assertEqual(q["response_type"], ["code"])
        self.assertEqual(q["code_challenge"], ["chall"])
        self.assertEqual(q["code_challenge_method"], ["S256"])
        self.assertEqual(q["state"], ["st4te"])


@override_settings(
    OIDC_CLIENT_ID="husfjelag-web",
    OIDC_CLIENT_SECRET="s3cret",
    OIDC_TOKEN_ENDPOINT="https://id.husfjelag.is/token",
    OIDC_REDIRECT_URI="https://api.husfjelag.is/auth/callback",
)
class ExchangeCodeTests(TestCase):
    def test_uses_client_secret_basic(self):
        fake_resp = mock.Mock()
        fake_resp.json.return_value = {"id_token": "abc"}
        fake_resp.raise_for_status.return_value = None

        with mock.patch.object(oidc.http, "post", return_value=fake_resp) as post:
            oidc.exchange_code(code="auth-code", code_verifier="verifier")

        _, kwargs = post.call_args
        # Client credentials go in the Authorization header, not the body.
        expected = "Basic " + base64.b64encode(b"husfjelag-web:s3cret").decode()
        self.assertEqual(kwargs["headers"]["Authorization"], expected)
        self.assertNotIn("client_id", kwargs["data"])
        self.assertNotIn("client_secret", kwargs["data"])
        self.assertEqual(kwargs["data"]["grant_type"], "authorization_code")
        self.assertEqual(kwargs["data"]["code"], "auth-code")
        self.assertEqual(kwargs["data"]["code_verifier"], "verifier")


@override_settings(
    OIDC_CLIENT_ID="husfjelag-web",
    OIDC_ISSUER="https://id.husfjelag.is",
    OIDC_JWKS_URI="https://id.husfjelag.is/jwks",
)
class ValidateIdTokenTests(TestCase):
    def setUp(self):
        oidc._jwks_cache = {"keys": []}  # avoid network fetch
        self.addCleanup(lambda: setattr(oidc, "_jwks_cache", None))

    def test_verifies_issuer_and_audience(self):
        with mock.patch.object(oidc.jwt, "decode", return_value={"sub": "1"}) as decode:
            oidc.validate_id_token("id.token.here")
        _, kwargs = decode.call_args
        self.assertEqual(kwargs["audience"], "husfjelag-web")
        self.assertEqual(kwargs["issuer"], "https://id.husfjelag.is")
        self.assertEqual(kwargs["algorithms"], ["RS256"])


class CallbackTests(TestCase):
    """OIDCCallbackView — claim mapping and is_test_user guard."""

    def _call(self, claims):
        self.client.cookies["oidc_state"] = "st4te"
        self.client.cookies["oidc_cv"] = "verifier"
        with mock.patch("users.views.exchange_code", return_value={"id_token": "tok"}), \
             mock.patch("users.views.validate_id_token", return_value=claims):
            return self.client.get("/auth/callback", {"code": "c", "state": "st4te"})

    @override_settings(DEBUG=True)
    def test_creates_user_keyed_on_kennitala(self):
        resp = self._call({
            "national_id": "010130-2989",
            "name": "Jón Jónsson",
            "phone_number": "5551234",
        })
        self.assertEqual(resp.status_code, 302)
        self.assertIn("/auth/callback?code=", resp["Location"])
        user = User.objects.get(kennitala="0101302989")  # hyphens stripped
        self.assertEqual(user.name, "Jón Jónsson")
        self.assertEqual(user.phone, "5551234")

    @override_settings(DEBUG=False)
    def test_rejects_test_user_in_production(self):
        resp = self._call({
            "national_id": "0101302989",
            "name": "Test",
            "is_test_user": True,
        })
        self.assertEqual(resp.status_code, 302)
        self.assertIn("error=test_user_blocked", resp["Location"])
        self.assertFalse(User.objects.filter(kennitala="0101302989").exists())
