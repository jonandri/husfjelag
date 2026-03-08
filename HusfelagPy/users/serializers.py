from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "kennitala", "name", "email", "phone"]


class LoginRequestSerializer(serializers.Serializer):
    personID = serializers.CharField(required=False, default="")
    phone = serializers.CharField(required=False, default="")
