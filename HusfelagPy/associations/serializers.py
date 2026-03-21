from rest_framework import serializers
from .models import Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership


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
        return obj.apartments.count()

    def get_owner_count(self, obj):
        return ApartmentOwnership.objects.filter(apartment__association=obj).values("user").distinct().count()

    def _get_role_name(self, obj, role):
        entry = AssociationAccess.objects.filter(
            association=obj, role=role, active=True
        ).select_related("user").first()
        return entry.user.name if entry else None

    def get_chair(self, obj):
        return self._get_role_name(obj, AssociationRole.CHAIR)

    def get_cfo(self, obj):
        return self._get_role_name(obj, AssociationRole.CFO)


class ApartmentOwnerSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    kennitala = serializers.CharField(source="user.kennitala", read_only=True)

    class Meta:
        model = ApartmentOwnership
        fields = ["id", "name", "kennitala", "share", "is_payer"]


class ApartmentSerializer(serializers.ModelSerializer):
    owners = ApartmentOwnerSerializer(source="ownerships", many=True, read_only=True)

    class Meta:
        model = Apartment
        fields = ["id", "anr", "fnr", "share", "share_2", "share_3", "share_eq", "deleted", "owners"]
