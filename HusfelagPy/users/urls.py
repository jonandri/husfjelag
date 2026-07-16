from django.urls import path
from .views import LoginView, OIDCLoginView, OIDCCallbackView, OIDCTokenExchangeView, OIDCLogoutView, UserMeView, UserView, TermsAcceptView, KennitalaLookupView

urlpatterns = [
    path("Login", LoginView.as_view(), name="login"),                          # legacy
    path("auth/login", OIDCLoginView.as_view(), name="oidc-login"),
    path("auth/callback", OIDCCallbackView.as_view(), name="oidc-callback"),
    path("auth/token", OIDCTokenExchangeView.as_view(), name="oidc-token"),    # exchange short code → JWT
    path("auth/logout", OIDCLogoutView.as_view(), name="oidc-logout"),         # RP-initiated logout → IdP end_session
    path("auth/terms/accept", TermsAcceptView.as_view(), name="terms-accept"),
    path("User/me", UserMeView.as_view(), name="user-me"),
    path("User/lookup", KennitalaLookupView.as_view(), name="user-lookup"),
    path("User/<int:user_id>", UserView.as_view(), name="user-detail"),
]
