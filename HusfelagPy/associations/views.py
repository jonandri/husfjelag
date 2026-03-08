from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema
from .models import HouseAssociation
from .serializers import HouseAssociationSerializer


class HouseAssociationView(APIView):
    @extend_schema(responses=HouseAssociationSerializer)
    def get(self, request, user_id):
        """
        GET /HouseAssociation/{user_id}
        NOTE: Currently queries by HouseAssociation.id == user_id (matching C# behavior).
        TODO: Fix to look up via UserAccess table instead.
        """
        try:
            association = HouseAssociation.objects.get(pk=user_id)
            return Response(HouseAssociationSerializer(association).data)
        except HouseAssociation.DoesNotExist:
            return Response(None, status=status.HTTP_200_OK)

    @extend_schema(request=HouseAssociationSerializer, responses=HouseAssociationSerializer)
    def post(self, request):
        """POST /HouseAssociation — Create a new house association."""
        serializer = HouseAssociationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
