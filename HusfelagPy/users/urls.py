from django.urls import path
from .views import LoginView, OIDCLoginView, OIDCCallbackView

urlpatterns = [
    path("Login", LoginView.as_view(), name="login"),          # legacy
    path("auth/login", OIDCLoginView.as_view(), name="oidc-login"),
    path("auth/callback", OIDCCallbackView.as_view(), name="oidc-callback"),
]
