from rest_framework import serializers
from .models import Association


class AssociationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Association
        fields = ["id", "ssn", "name", "address", "postal_code", "city"]
