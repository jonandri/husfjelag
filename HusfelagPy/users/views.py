import logging

import bugsnag
import requests
from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from .models import User, TermsAcceptance, AuditLog
from .serializers import UserSerializer


def _get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
from .oidc import build_auth_url, exchange_code, generate_pkce_pair, generate_state, validate_id_token, create_access_token

logger = logging.getLogger(__name__)


class LoginView(APIView):
    """Legacy login — disabled. Use GET /auth/login (Húsfjelag OIDC) instead."""
    permission_classes = [AllowAny]

    def post(self, request):
        return Response(
            {"detail": "This endpoint has been disabled. Use /auth/login instead."},
            status=status.HTTP_410_GONE,
        )


class UserMeView(APIView):
    """GET /User/me — return the authenticated user's own profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserView(APIView):
    """GET/PATCH /User/{user_id} — users may only access their own profile."""
    permission_classes = [IsAuthenticated]

    def _get_user(self, request, user_id):
        """Return the user if the requester owns this profile (or is superadmin)."""
        if not request.user.is_superadmin and request.user.id != user_id:
            return None, Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        try:
            return User.objects.get(id=user_id), None
        except User.DoesNotExist:
            return None, Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    def get(self, request, user_id):
        """GET /User/{user_id} — Return profile for a user."""
        user, err = self._get_user(request, user_id)
        if err:
            return err
        return Response(UserSerializer(user).data)

    def patch(self, request, user_id):
        """PATCH /User/{user_id} — Update name, email and/or phone."""
        user, err = self._get_user(request, user_id)
        if err:
            return err

        if "name" in request.data:
            name = (request.data["name"] or "").strip()
            if not name:
                return Response({"detail": "Nafn má ekki vera tómt."}, status=status.HTTP_400_BAD_REQUEST)
            user.name = name
        email = request.data.get("email", user.email)
        phone = request.data.get("phone", user.phone)
        user.email = email or None
        user.phone = phone or None
        user.save(update_fields=["name", "email", "phone"])
        return Response(UserSerializer(user).data)


class TermsAcceptView(APIView):
    """POST /auth/terms/accept — record that the authenticated user accepted the terms."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if hasattr(user, 'terms_acceptance'):
            return Response(UserSerializer(user).data)
        TermsAcceptance.objects.create(
            user=user,
            kennitala=user.kennitala,
            name=user.name,
            ip_address=_get_client_ip(request),
        )
        # Re-fetch to pick up the new reverse relation
        user_fresh = User.objects.select_related('terms_acceptance').get(pk=user.pk)
        return Response(UserSerializer(user_fresh).data, status=status.HTTP_201_CREATED)


class OIDCLoginView(APIView):
    """
    GET /auth/login
    Redirects the user to id.husfjelag.is for authentication.
    A random state token is stored in a cookie to prevent CSRF.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        state = generate_state()
        code_verifier, code_challenge = generate_pkce_pair()
        response = HttpResponseRedirect(build_auth_url(state, code_challenge))
        cookie_opts = dict(max_age=300, httponly=True, samesite="Lax")
        response.set_cookie("oidc_state", state, **cookie_opts)
        response.set_cookie("oidc_cv", code_verifier, **cookie_opts)
        return response


class OIDCCallbackView(APIView):
    """
    GET /auth/callback
    id.husfjelag.is redirects here after authentication.
    Validates state, exchanges code for tokens, creates/updates the User,
    then redirects to the frontend with a short-lived one-time exchange code
    (not the JWT itself — avoids token in URL / server logs).
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from django.core.cache import cache
        import secrets

        code = request.GET.get("code")
        state = request.GET.get("state")
        error = request.GET.get("error")
        error_description = request.GET.get("error_description", "")

        frontend_url = settings.FRONTEND_URL
        logger.info("OIDC callback — error=%s code_present=%s state_present=%s", error, bool(code), bool(state))

        if error:
            logger.error("IdP returned error: %s — %s", error, error_description)
            return HttpResponseRedirect(f"{frontend_url}/?error={error}")

        # CSRF: validate state matches what we set in the cookie
        cookie_state = request.COOKIES.get("oidc_state")
        if not state or state != cookie_state:
            logger.error("OIDC state mismatch — got=%s cookie=%s", state, cookie_state)
            return HttpResponseRedirect(f"{frontend_url}/?error=invalid_state")

        if not code:
            logger.error("OIDC callback missing code")
            return HttpResponseRedirect(f"{frontend_url}/?error=no_code")

        code_verifier = request.COOKIES.get("oidc_cv", "")
        logger.info("OIDC exchanging code, code_verifier_present=%s", bool(code_verifier))

        try:
            tokens = exchange_code(code, code_verifier)
            claims = validate_id_token(tokens["id_token"])
            logger.info("OIDC token exchange succeeded, kennitala=%s", (claims.get("national_id") or "")[:6] + "****")
        except Exception as exc:
            logger.exception("OIDC token exchange/validation failed")
            bugsnag.notify(exc, context="OIDC token exchange/validation")
            return HttpResponseRedirect(f"{frontend_url}/?error=token_error")

        # Test users must never authenticate against production.
        if not settings.DEBUG and claims.get("is_test_user"):
            logger.error("Blocked is_test_user login in production")
            return HttpResponseRedirect(f"{frontend_url}/?error=test_user_blocked")

        kennitala = (claims.get("national_id") or "").replace("-", "")
        name = claims.get("name") or ""
        phone = claims.get("phone_number") or None  # None = not provided by the IdP

        if not kennitala:
            return HttpResponseRedirect(f"{frontend_url}/?error=no_national_id")

        # Get or create the user; update name/phone if they changed
        user, created = User.objects.get_or_create(
            kennitala=kennitala,
            defaults={"name": name, "phone": phone},
        )
        # Always update last_login; also sync name/phone if they changed
        from django.utils import timezone
        updated_fields = ["last_login"]
        user.last_login = timezone.now()
        if not created:
            if name and user.name != name:
                user.name = name
                updated_fields.append("name")
            if phone and user.phone != phone:
                user.phone = phone
                updated_fields.append("phone")
        user.save(update_fields=updated_fields)
        AuditLog.objects.create(user=user, action='login')

        jwt_token = create_access_token(user.id)

        # Store JWT in cache under a one-time exchange code (TTL: 60s).
        # The frontend exchanges this short code for the real token via POST /auth/token.
        # This keeps the JWT out of server logs and browser history.
        exchange_code_val = secrets.token_urlsafe(32)
        cache.set(f"auth_code:{exchange_code_val}", jwt_token, timeout=60)

        response = HttpResponseRedirect(
            f"{frontend_url}/auth/callback?code={exchange_code_val}"
        )
        response.delete_cookie("oidc_state")
        response.delete_cookie("oidc_cv")
        return response


class OIDCTokenExchangeView(APIView):
    """
    POST /auth/token  { "code": "<exchange_code>" }
    Exchanges a one-time code (from the OIDC callback redirect) for the real JWT.
    The code is deleted immediately after use and expires in 60 seconds.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from django.core.cache import cache

        exchange_code_val = request.data.get("code", "")
        if not exchange_code_val:
            return Response({"detail": "Missing code."}, status=status.HTTP_400_BAD_REQUEST)

        cache_key = f"auth_code:{exchange_code_val}"
        jwt_token = cache.get(cache_key)
        if not jwt_token:
            return Response({"detail": "Invalid or expired code."}, status=status.HTTP_400_BAD_REQUEST)

        # One-time use — delete immediately
        cache.delete(cache_key)
        return Response({"token": jwt_token})


class KennitalaLookupView(APIView):
    """
    GET /User/lookup?kennitala=XXXXXXXXXX
    Resolves a kennitala to a name.
    1. Checks our own User table first (free, instant). Stub users (name == kennitala)
       are treated as unresolved and fall through to step 2.
    2. Calls Já/Gagnatorg national registry API.
    3. On success: creates the User row if it doesn't exist, or updates the name if it
       was a stub. This ensures the real name is stored after the first lookup.
    Returns: {kennitala, name, source: "db"|"registry"}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        kennitala = request.query_params.get("kennitala", "").replace("-", "").strip()
        if len(kennitala) != 10 or not kennitala.isdigit():
            return Response({"detail": "kennitala must be 10 digits."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Check our own DB first — skip stub users whose name equals their kennitala
        try:
            user = User.objects.get(kennitala=kennitala)
            if user.name and user.name != kennitala:
                return Response({"kennitala": kennitala, "name": user.name, "source": "db"})
        except User.DoesNotExist:
            user = None

        # 2. Look up in Já / Gagnatorg national registry
        api_key = settings.JA_API_KEY
        if not api_key:
            return Response({"detail": "Þjóðskrárfletting er ekki stillt."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            resp = requests.get(
                f"https://api.ja.is/skra/v1/people/{kennitala}",
                headers={"Authorization": api_key},
                timeout=5,
            )
        except requests.RequestException:
            return Response({"detail": "Þjóðskrá er ekki aðgengileg."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if resp.status_code == 404:
            return Response({"detail": "Kennitala fannst ekki í Þjóðskrá."}, status=status.HTTP_404_NOT_FOUND)
        if not resp.ok:
            logger.error("Já API returned %s for kennitala lookup", resp.status_code)
            return Response({"detail": "Villa við Þjóðskrárflettingu."}, status=status.HTTP_502_BAD_GATEWAY)

        data = resp.json()
        name = data.get("name", "").strip()
        if not name:
            return Response({"detail": "Kennitala fannst ekki í Þjóðskrá."}, status=status.HTTP_404_NOT_FOUND)

        # 3. Persist: update stub user or create a new user row with the real name
        if user is not None:
            user.name = name
            user.save(update_fields=["name"])
        else:
            User.objects.get_or_create(kennitala=kennitala, defaults={"name": name})

        return Response({"kennitala": kennitala, "name": name, "source": "registry"})
