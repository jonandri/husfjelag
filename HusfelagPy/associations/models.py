from django.db import models


class Association(models.Model):
    ssn = models.CharField(max_length=10, unique=True)  # Kennitala
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500)
    postal_code = models.CharField(max_length=10)
    city = models.CharField(max_length=255)
    date_of_board_change = models.DateField(null=True, blank=True)
    registered = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=100, null=True, blank=True)

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
    INCOME = "INCOME", "Tekjur"


class Category(models.Model):
    # association FK removed — categories are global, managed by superadmin
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=CategoryType.choices)
    deleted = models.BooleanField(default=False)
    expense_account = models.ForeignKey(
        "AccountingKey", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="expense_categories",
    )
    income_account = models.ForeignKey(
        "AccountingKey", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="income_categories",
    )

    class Meta:
        db_table = "associations_category"

    def __str__(self):
        return f"{self.name} ({self.type})"


class AccountingKeyType(models.TextChoices):
    ASSET     = "ASSET",     "Eign"
    LIABILITY = "LIABILITY", "Skuld"
    EQUITY    = "EQUITY",    "Eigið fé"
    INCOME    = "INCOME",    "Tekjur"
    EXPENSE   = "EXPENSE",   "Gjöld"


class AccountingKey(models.Model):
    number  = models.IntegerField(unique=True)
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=AccountingKeyType.choices)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_accountingkey"
        ordering = ["number"]

    def __str__(self):
        return f"{self.number} · {self.name}"


class BankAccount(models.Model):
    association    = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="bank_accounts")
    name           = models.CharField(max_length=255)
    account_number = models.CharField(max_length=50)
    asset_account  = models.ForeignKey(
        AccountingKey, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="bank_accounts",
    )
    description    = models.CharField(max_length=255, blank=True)
    deleted        = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_bankaccount"

    def __str__(self):
        return f"{self.name} ({self.account_number})"


class TransactionStatus(models.TextChoices):
    IMPORTED    = "IMPORTED",   "Innflutt"
    CATEGORISED = "CATEGORISED", "Flokkað"
    RECONCILED  = "RECONCILED", "Jafnað"


class TransactionSource(models.TextChoices):
    MANUAL    = "MANUAL",    "Handvirkt"
    BANK_SYNC = "BANK_SYNC", "Bankajöfnun"


class Transaction(models.Model):
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name="transactions")
    date         = models.DateField()
    amount       = models.DecimalField(max_digits=14, decimal_places=2)  # positive=in, negative=out
    description  = models.CharField(max_length=500)
    reference    = models.CharField(max_length=255, blank=True)
    payer_kennitala = models.CharField(max_length=20, blank=True, default="")
    category     = models.ForeignKey(
        Category, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="transactions",
    )
    status       = models.CharField(
        max_length=20, choices=TransactionStatus.choices,
        default=TransactionStatus.IMPORTED,
    )
    created_at   = models.DateTimeField(auto_now_add=True)
    source      = models.CharField(
        max_length=10, choices=TransactionSource.choices,
        default=TransactionSource.MANUAL,
    )
    external_id = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "associations_transaction"
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.date} {self.description}: {self.amount}"


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
    paid_transaction = models.ForeignKey(
        "Transaction", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="collection_payment",
    )

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


class CategoryRule(models.Model):
    keyword     = models.CharField(max_length=255)
    category    = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="rules")
    association = models.ForeignKey(
        Association, null=True, blank=True,
        on_delete=models.CASCADE, related_name="category_rules"
    )
    deleted     = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_categoryrule"

    def __str__(self):
        scope = self.association.name if self.association_id else "global"
        return f"{self.keyword} → {self.category} ({scope})"


class BankChoice(models.TextChoices):
    LANDSBANKINN = "LANDSBANKINN", "Landsbankinn"
    ARION        = "ARION",        "Arion"
    ISLANDSBANKI = "ISLANDSBANKI", "Íslandsbanki"


class BankConsent(models.Model):
    association      = models.OneToOneField(
        Association, on_delete=models.CASCADE, related_name="bank_consent"
    )
    bank             = models.CharField(max_length=20, choices=BankChoice.choices)
    consent_id       = models.CharField(max_length=255, blank=True)
    access_token     = models.TextField()
    refresh_token    = models.TextField(blank=True)
    token_expires_at = models.DateTimeField()
    consent_expires_at = models.DateField()
    is_active        = models.BooleanField(default=True)
    renewal_notified_at = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "associations_bankconsent"

    def __str__(self):
        return f"{self.association} — {self.bank}"


class BankApiAuditLog(models.Model):
    association = models.ForeignKey(
        Association, on_delete=models.CASCADE, related_name="bank_audit_logs"
    )
    user        = models.ForeignKey(
        "users.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="bank_audit_logs"
    )
    bank        = models.CharField(max_length=20, choices=BankChoice.choices)
    endpoint    = models.CharField(max_length=500)
    http_method = models.CharField(max_length=10)
    status_code = models.IntegerField()
    timestamp   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "associations_bankapiauditlog"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.bank} {self.http_method} {self.endpoint} → {self.status_code}"


class BankNotificationLog(models.Model):
    class NotificationType(models.TextChoices):
        CONSENT_EXPIRY = "CONSENT_EXPIRY", "Samþykki rennur út"

    association       = models.ForeignKey(
        Association, on_delete=models.CASCADE, related_name="bank_notification_logs"
    )
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)
    recipients        = models.JSONField()
    sent_at           = models.DateTimeField(auto_now_add=True)
    success           = models.BooleanField()
    error             = models.TextField(blank=True)

    class Meta:
        db_table = "associations_banknotificationlog"
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.association} — {self.notification_type} ({'ok' if self.success else 'failed'})"
