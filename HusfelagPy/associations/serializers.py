from rest_framework import serializers
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, Budget, BudgetItem, AccountingKey, BankAccount,
)


class AssociationSerializer(serializers.ModelSerializer):
    apartment_count = serializers.SerializerMethodField()
    owner_count = serializers.SerializerMethodField()
    chair = serializers.SerializerMethodField()
    cfo = serializers.SerializerMethodField()

    class Meta:
        model = Association
        fields = ["id", "ssn", "name", "address", "postal_code", "city",
                  "apartment_count", "owner_count", "chair", "cfo"]

    def get_apartment_count(self, obj):
        return obj.apartments.filter(deleted=False).count()

    def get_owner_count(self, obj):
        return ApartmentOwnership.objects.filter(
            apartment__association=obj, apartment__deleted=False, deleted=False
        ).values("user").distinct().count()

    def _get_role_entry(self, obj, role):
        return AssociationAccess.objects.filter(
            association=obj, role=role, active=True
        ).select_related("user").first()

    def get_chair(self, obj):
        e = self._get_role_entry(obj, AssociationRole.CHAIR)
        return e.user.name if e else None

    def get_cfo(self, obj):
        e = self._get_role_entry(obj, AssociationRole.CFO)
        return e.user.name if e else None


class ApartmentOwnerSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    kennitala = serializers.CharField(source="user.kennitala", read_only=True)

    class Meta:
        model = ApartmentOwnership
        fields = ["id", "name", "kennitala", "share", "is_payer"]


class ApartmentSerializer(serializers.ModelSerializer):
    owners = serializers.SerializerMethodField()

    def get_owners(self, obj):
        active = obj.ownerships.filter(deleted=False)
        return ApartmentOwnerSerializer(active, many=True).data

    class Meta:
        model = Apartment
        fields = ["id", "anr", "fnr", "size", "share", "share_2", "share_3", "share_eq", "deleted", "owners"]


class OwnershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    kennitala = serializers.CharField(source="user.kennitala", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True, allow_null=True)
    phone = serializers.CharField(source="user.phone", read_only=True, allow_null=True)
    apartment_id = serializers.IntegerField(source="apartment.id", read_only=True)
    anr = serializers.CharField(source="apartment.anr", read_only=True)
    fnr = serializers.CharField(source="apartment.fnr", read_only=True)

    class Meta:
        model = ApartmentOwnership
        fields = ["id", "user_id", "name", "kennitala", "email", "phone", "apartment_id", "anr", "fnr", "share", "is_payer", "deleted"]


class CategorySerializer(serializers.ModelSerializer):
    expense_account_id = serializers.IntegerField(
        source="expense_account.id", read_only=True, allow_null=True
    )
    expense_account_number = serializers.IntegerField(
        source="expense_account.number", read_only=True, allow_null=True
    )
    income_account_id = serializers.IntegerField(
        source="income_account.id", read_only=True, allow_null=True
    )
    income_account_number = serializers.IntegerField(
        source="income_account.number", read_only=True, allow_null=True
    )

    class Meta:
        model = Category
        fields = [
            "id", "name", "type", "deleted",
            "expense_account_id", "expense_account_number",
            "income_account_id", "income_account_number",
        ]


class AccountingKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountingKey
        fields = ["id", "number", "name", "type", "deleted"]


class BankAccountSerializer(serializers.ModelSerializer):
    asset_account = serializers.SerializerMethodField()

    def get_asset_account(self, obj):
        if not obj.asset_account_id:
            return None
        return {
            "id": obj.asset_account.id,
            "number": obj.asset_account.number,
            "name": obj.asset_account.name,
        }

    class Meta:
        model = BankAccount
        fields = ["id", "name", "account_number", "description", "deleted", "asset_account"]


class BudgetItemSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(source="category.id", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_type = serializers.CharField(source="category.type", read_only=True)

    class Meta:
        model = BudgetItem
        fields = ["id", "category_id", "category_name", "category_type", "amount"]


class BudgetSerializer(serializers.ModelSerializer):
    items = BudgetItemSerializer(many=True, read_only=True)

    class Meta:
        model = Budget
        fields = ["id", "year", "version", "is_active", "items"]


class AssociationAccessSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Association
        fields = ["id", "ssn", "name", "address", "postal_code", "city", "role"]

    ROLE_LABELS = {
        "CHAIR": "Formaður",
        "CFO": "Gjaldkeri",
        "MEMBER": "Eigandi",
    }

    def get_role(self, obj):
        user_id = self.context.get("user_id")
        is_superadmin = self.context.get("is_superadmin", False)
        if not user_id:
            return "Kerfisstjóri"
        access = AssociationAccess.objects.filter(
            association=obj, user_id=user_id, active=True
        ).first()
        if not access:
            return "Kerfisstjóri" if is_superadmin else None
        return self.ROLE_LABELS.get(access.role, access.role)
