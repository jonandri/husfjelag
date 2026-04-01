import logging

from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from .models import User
from .serializers import UserSerializer, LoginRequestSerializer
from .oidc import build_auth_url, exchange_code, generate_pkce_pair, generate_state, validate_id_token, create_access_token

logger = logging.getLogger(__name__)


class LoginView(APIView):
    @extend_schema(request=LoginRequestSerializer, responses=UserSerializer)
    def post(self, request):
        """
        POST /Login — legacy endpoint, kept for backwards compatibility.
        TODO: Remove once OIDC flow is fully adopted.
        """
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        person_id = data.get("personID", "")
        phone = data.get("phone", "")

        if len(person_id) >= 10:
            kennitala = person_id.replace("-", "")
            try:
                user = User.objects.get(kennitala=kennitala)
                return Response(UserSerializer(user).data)
            except User.DoesNotExist:
                return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        elif len(phone) >= 7:
            phone = phone.replace(" ", "")
            # TODO: Integrate with Rafræn skilríki
            return Response({})

        return Response(
            {"detail": "Invalid personID or phone number."},
            status=status.HTTP_401_UNAUTHORIZED,
        )


class UserView(APIView):
    def get(self, request, user_id):
        """GET /User/{user_id} — Return profile for a user."""
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSerializer(user).data)

    def patch(self, request, user_id):
        """PATCH /User/{user_id} — Update name, email and/or phone."""
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

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


class OIDCLoginView(APIView):
    """
    GET /auth/login
    Redirects the user to Kenni for authentication.
    A random state token is stored in a cookie to prevent CSRF.
    """
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
    Kenni redirects here after authentication.
    Validates state, exchanges code for tokens, creates/updates the User,
    then redirects to the frontend with a JWT + user ID.
    """
    def get(self, request):
        code = request.GET.get("code")
        state = request.GET.get("state")
        error = request.GET.get("error")

        frontend_url = settings.FRONTEND_URL

        if error:
            logger.warning("Kenni auth error: %s", error)
            return HttpResponseRedirect(f"{frontend_url}/?error={error}")

        # CSRF: validate state matches what we set in the cookie
        if not state or state != request.COOKIES.get("oidc_state"):
            logger.warning("OIDC state mismatch")
            return HttpResponseRedirect(f"{frontend_url}/?error=invalid_state")

        if not code:
            return HttpResponseRedirect(f"{frontend_url}/?error=no_code")

        code_verifier = request.COOKIES.get("oidc_cv", "")

        try:
            tokens = exchange_code(code, code_verifier)
            claims = validate_id_token(tokens["id_token"])
        except Exception:
            logger.exception("OIDC token exchange/validation failed")
            return HttpResponseRedirect(f"{frontend_url}/?error=token_error")

        kennitala = (claims.get("national_id") or "").replace("-", "")
        name = claims.get("name") or ""
        phone = claims.get("phone_number") or None  # None = not provided by Kenni

        if not kennitala:
            return HttpResponseRedirect(f"{frontend_url}/?error=no_national_id")

        # Get or create the user; update name/phone if they changed
        user, created = User.objects.get_or_create(
            kennitala=kennitala,
            defaults={"name": name, "phone": phone},
        )
        if not created:
            updated = False
            if name and user.name != name:
                user.name = name
                updated = True
            if phone and user.phone != phone:
                user.phone = phone
                updated = True
            if updated:
                user.save()

        token = create_access_token(user.id)

        response = HttpResponseRedirect(
            f"{frontend_url}/auth/callback?token={token}&uid={user.id}"
        )
        response.delete_cookie("oidc_state")
        response.delete_cookie("oidc_cv")
        return response
