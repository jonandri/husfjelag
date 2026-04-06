from django.urls import path
from .views import LoginView, OIDCLoginView, OIDCCallbackView, OIDCTokenExchangeView, UserMeView, UserView

urlpatterns = [
    path("Login", LoginView.as_view(), name="login"),                          # legacy
    path("auth/login", OIDCLoginView.as_view(), name="oidc-login"),
    path("auth/callback", OIDCCallbackView.as_view(), name="oidc-callback"),
    path("auth/token", OIDCTokenExchangeView.as_view(), name="oidc-token"),    # exchange short code → JWT
    path("User/me", UserMeView.as_view(), name="user-me"),
    path("User/<int:user_id>", UserView.as_view(), name="user-detail"),
]
