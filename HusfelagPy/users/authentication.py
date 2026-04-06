"""
Custom DRF authentication class that validates the HS256 JWT
issued by users.oidc.create_access_token().

Usage: configured globally in REST_FRAMEWORK settings.
"""
import datetime
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from jose import jwt, JWTError
from django.conf import settings

from .models import User


class JWTAuthentication(BaseAuthentication):
    """
    Reads the Authorization header:  Authorization: Bearer <token>
    Validates the token, returns (user, token) or raises AuthenticationFailed.
    Returns None (anonymous) if no Authorization header is present,
    allowing AllowAny views to still function.
    """

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None  # No credentials — let permission class decide

        token = auth_header[len("Bearer "):]
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
            )
        except JWTError as e:
            raise AuthenticationFailed(f"Invalid or expired token: {e}")

        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationFailed("Token missing subject claim.")

        try:
            user = User.objects.get(id=int(user_id))
        except (User.DoesNotExist, ValueError):
            raise AuthenticationFailed("User not found.")

        return (user, token)

    def authenticate_header(self, request):
        return "Bearer"
