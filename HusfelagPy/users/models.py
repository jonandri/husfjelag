from django.db import models


class User(models.Model):
    kennitala = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, null=True, default=None)
    phone = models.CharField(max_length=20, blank=True, null=True, default=None)

    class Meta:
        db_table = "users_user"

    def __str__(self):
        return f"{self.name} ({self.kennitala})"
