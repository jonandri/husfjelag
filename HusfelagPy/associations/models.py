from django.db import models


class Association(models.Model):
    ssn = models.CharField(max_length=10, unique=True)  # Kennitala
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500)
    postal_code = models.CharField(max_length=10)
    city = models.CharField(max_length=255)

    class Meta:
        db_table = "associations_association"

    def __str__(self):
        return f"{self.name} ({self.ssn})"


class AssociationRole(models.TextChoices):
    CHAIR = "CHAIR", "Chair"
    CFO = "CFO", "CFO"
    MEMBER = "MEMBER", "Member"


class AssociationAccess(models.Model):
    """Links a User to an Association with a role (Chair, CFO, Member)."""
    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="association_access")
    association = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="access_entries")
    role = models.CharField(max_length=10, choices=AssociationRole.choices, default=AssociationRole.MEMBER)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "associations_associationaccess"
        unique_together = [("user", "association")]

    def __str__(self):
        return f"{self.user} — {self.association} ({self.role})"


class Apartment(models.Model):
    association = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="apartments")
    fnr = models.CharField(max_length=8)   # Fasteignanúmer (government property ID)
    anr = models.CharField(max_length=7)   # Merking (apartment identifier)
    size = models.DecimalField(max_digits=8, decimal_places=2, default=0)  # Flatarmál í m²
    share = models.DecimalField(max_digits=5, decimal_places=2, default=0)    # Matshlutfall skv. eignaskiptasamningi
    share_2 = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # Matshlutfall hita
    share_3 = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # Matshlutfall lóðar
    share_eq = models.DecimalField(max_digits=5, decimal_places=2, default=0) # Jafnt hlutfall (reiknað)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_apartment"
        unique_together = [("association", "fnr")]

    def __str__(self):
        return f"{self.anr} ({self.fnr})"


class ApartmentOwnership(models.Model):
    """Links a User to an Apartment as an owner."""
    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="ownerships")
    apartment = models.ForeignKey(Apartment, on_delete=models.CASCADE, related_name="ownerships")
    share = models.DecimalField(max_digits=5, decimal_places=2)  # % of apartment this owner holds
    is_payer = models.BooleanField(default=False)  # Only one owner per apartment should be payer
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_apartmentownership"
        unique_together = [("user", "apartment")]

    def __str__(self):
        return f"{self.user} → {self.apartment} ({self.share}%)"


class CategoryType(models.TextChoices):
    SHARED = "SHARED", "Sameiginlegt"
    SHARE2 = "SHARE2", "Hiti"
    SHARE3 = "SHARE3", "Lóð"
    EQUAL  = "EQUAL",  "Jafnskipt"


class Category(models.Model):
    association = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=CategoryType.choices)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_category"

    def __str__(self):
        return f"{self.name} ({self.type})"


class Budget(models.Model):
    association = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="budgets")
    year = models.IntegerField()
    version = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)  # only the latest version is active

    class Meta:
        db_table = "associations_budget"
        unique_together = [("association", "year", "version")]

    def __str__(self):
        suffix = f" v{self.version}" if self.version > 1 else ""
        return f"{self.association} — {self.year}{suffix}"


class BudgetItem(models.Model):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name="items")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="budget_items", null=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "associations_budgetitem"
        unique_together = [("budget", "category")]

    def __str__(self):
        return f"{self.budget} — {self.category}: {self.amount}"


class CollectionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PAID = "PAID", "Paid"
    OVERDUE = "OVERDUE", "Overdue"


class Collection(models.Model):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name="collections")
    apartment = models.ForeignKey(Apartment, on_delete=models.CASCADE, related_name="collections")
    payer = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True, related_name="collections")
    month = models.IntegerField()  # 1–12
    amount_shared = models.DecimalField(max_digits=10, decimal_places=2)  # Calculated by share %
    amount_equal = models.DecimalField(max_digits=10, decimal_places=2)   # Equally divided portion
    amount_total = models.DecimalField(max_digits=10, decimal_places=2)   # amount_shared + amount_equal
    status = models.CharField(max_length=10, choices=CollectionStatus.choices, default=CollectionStatus.PENDING)

    class Meta:
        db_table = "associations_collection"
        unique_together = [("budget", "apartment", "month")]

    def __str__(self):
        return f"{self.apartment} — {self.budget.year}/{self.month:02d}: {self.amount_total}"


class HMSImportSource(models.Model):
    association = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="hms_sources")
    url = models.URLField()
    landeign_id = models.IntegerField()   # e.g. 228369  → displayed as "L228369"
    stadfang_id = models.IntegerField()   # e.g. 1203373 → displayed as "STF1203373"
    last_imported_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "associations_hmsimportsource"
        unique_together = [("association", "stadfang_id")]

    def __str__(self):
        return f"{self.association} — STF{self.stadfang_id}"
