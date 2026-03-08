from rest_framework import serializers
from .models import HouseAssociation


class HouseAssociationSerializer(serializers.ModelSerializer):
    class Meta:
        model = HouseAssociation
        fields = ["id", "kennitala", "name", "address", "email"]
