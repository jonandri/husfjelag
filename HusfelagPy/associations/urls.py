from django.urls import path
from .views import HouseAssociationView

urlpatterns = [
    path("HouseAssociation/<int:user_id>", HouseAssociationView.as_view(), name="house-association-detail"),
    path("HouseAssociation", HouseAssociationView.as_view(), name="house-association-create"),
]
