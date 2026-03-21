from django.urls import path
from .views import AssociationView, AssociationLookupView, ApartmentView, ApartmentOwnerView, OwnerView

urlpatterns = [
    path("Association/lookup", AssociationLookupView.as_view(), name="association-lookup"),
    path("Association/<int:user_id>", AssociationView.as_view(), name="association-detail"),
    path("Association", AssociationView.as_view(), name="association-create"),
    path("Apartment/<int:user_id>", ApartmentView.as_view(), name="apartment-list"),
    path("Apartment", ApartmentView.as_view(), name="apartment-create"),
    path("Apartment/update/<int:apartment_id>", ApartmentView.as_view(), name="apartment-update"),
    path("Apartment/delete/<int:apartment_id>", ApartmentView.as_view(), name="apartment-delete"),
    path("Apartment/enable/<int:apartment_id>", ApartmentView.as_view(), name="apartment-enable"),
    path("Apartment/<int:apartment_id>/owner/<int:owner_id>", ApartmentOwnerView.as_view(), name="apartment-owner-delete"),
    path("Apartment/<int:apartment_id>/owner", ApartmentOwnerView.as_view(), name="apartment-owner-create"),
    path("Owner/<int:user_id>", OwnerView.as_view(), name="owner-list"),
    path("Owner", OwnerView.as_view(), name="owner-create"),
    path("Owner/update/<int:ownership_id>", OwnerView.as_view(), name="owner-update"),
    path("Owner/delete/<int:ownership_id>", OwnerView.as_view(), name="owner-delete"),
    path("Owner/enable/<int:ownership_id>", OwnerView.as_view(), name="owner-enable"),
]
