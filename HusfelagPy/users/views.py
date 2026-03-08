from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema
from .models import User
from .serializers import UserSerializer, LoginRequestSerializer


class LoginView(APIView):
    @extend_schema(request=LoginRequestSerializer, responses=UserSerializer)
    def post(self, request):
        """
        POST /Login
        Accepts { "personID": "...", "phone": "..." }
        Lookup by Kennitala (personID) or phone number.
        TODO: Integrate with Auðkennisappið (personID) and Rafræn skilríki (phone).
        """
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        person_id = data.get("personID", "")
        phone = data.get("phone", "")

        if len(person_id) >= 10:
            kennitala = person_id.replace("-", "")
            try:
                user = User.objects.get(kennitala=kennitala)
                return Response(UserSerializer(user).data)
            except User.DoesNotExist:
                return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        elif len(phone) >= 7:
            phone = phone.replace(" ", "")
            # TODO: Integrate with Rafræn skilríki
            return Response({})

        return Response(
            {"detail": "Invalid personID or phone number."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
