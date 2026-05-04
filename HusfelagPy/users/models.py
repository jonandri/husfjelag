from django.db import models
from django.utils import timezone


class User(models.Model):
    kennitala = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, null=True, default=None)
    phone = models.CharField(max_length=20, blank=True, null=True, default=None)
    is_superadmin = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)

    # Required by DRF's IsAuthenticated permission check.
    # Always True because unauthenticated requests get AnonymousUser, not a User instance.
    is_authenticated = True

    class Meta:
        db_table = "users_user"

    def get_full_name(self):
        return self.name

    def get_short_name(self):
        return self.name.split()[0] if self.name else ""

    def get_username(self):
        return self.kennitala

    def __str__(self):
        return f"{self.name} ({self.kennitala})"


class AuditLog(models.Model):
    ACTIONS = [
        ('login', 'Login'),
        ('chair_changed', 'Chair changed'),
        ('cfo_changed', 'CFO changed'),
        ('association_new', 'Association created'),
    ]

    created_at = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=32, choices=ACTIONS)
    value = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        db_table = 'users_auditlog'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} — user_id={self.user_id} at {self.created_at}"


class TermsAcceptance(models.Model):
    """Audit log of user terms acceptance. Never updated — only created."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='terms_acceptance')
    kennitala = models.CharField(max_length=10)   # denormalised for audit durability
    name = models.CharField(max_length=255)        # denormalised for audit durability
    accepted_at = models.DateTimeField(default=timezone.now)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = 'users_termsacceptance'

    def __str__(self):
        return f"{self.name} ({self.kennitala}) accepted at {self.accepted_at}"
