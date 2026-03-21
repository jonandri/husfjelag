from django.contrib import admin
from .models import Association, AssociationAccess, Apartment, ApartmentOwnership, Budget, BudgetItem, Collection

admin.site.register(Association)
admin.site.register(AssociationAccess)
admin.site.register(Apartment)
admin.site.register(ApartmentOwnership)
admin.site.register(Budget)
admin.site.register(BudgetItem)
admin.site.register(Collection)
