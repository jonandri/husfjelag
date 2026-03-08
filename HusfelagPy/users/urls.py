from django.urls import path
from .views import LoginView

urlpatterns = [
    path("Login", LoginView.as_view(), name="login"),
]
