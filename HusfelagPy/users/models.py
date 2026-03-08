from django.db import models


class User(models.Model):
    kennitala = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        db_table = "users_user"

    def __str__(self):
        return f"{self.name} ({self.kennitala})"


class UserAccessRole(models.TextChoices):
    ADMIN = "Admin"
    FINANCE = "Finance"
    USER = "User"


class UserAccess(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="access_entries")
    house_association = models.ForeignKey(
        "associations.HouseAssociation", on_delete=models.CASCADE, related_name="user_access"
    )
    role = models.CharField(max_length=10, choices=UserAccessRole.choices, default=UserAccessRole.USER)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "users_useraccess"
        unique_together = [("user", "house_association")]

    def __str__(self):
        return f"{self.user} — {self.house_association} ({self.role})"
