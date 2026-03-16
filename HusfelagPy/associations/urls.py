from django.urls import path
from .views import AssociationView, AssociationLookupView

urlpatterns = [
    path("Association/lookup", AssociationLookupView.as_view(), name="association-lookup"),
    path("Association/<int:user_id>", AssociationView.as_view(), name="association-detail"),
    path("Association", AssociationView.as_view(), name="association-create"),
]
