from django.db import models


class HouseAssociation(models.Model):
    kennitala = models.CharField(max_length=10)
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500)
    email = models.EmailField(blank=True, default="")

    class Meta:
        db_table = "associations_houseassociation"

    def __str__(self):
        return f"{self.name} ({self.kennitala})"


class Apartment(models.Model):
    house_association = models.ForeignKey(
        HouseAssociation, on_delete=models.CASCADE, related_name="apartments"
    )
    apartment_number = models.CharField(max_length=50)
    percentage_owned = models.FloatField()
    pay_common_fees = models.BooleanField(default=True)
    building_name = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "associations_apartment"

    def __str__(self):
        return f"{self.apartment_number} — {self.house_association}"
