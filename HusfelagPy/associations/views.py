from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from .models import Association, AssociationAccess, AssociationRole
from .serializers import AssociationSerializer
from .scraper import lookup_association


class AssociationView(APIView):
    @extend_schema(responses=AssociationSerializer)
    def get(self, request, user_id):
        """GET /Association/{user_id} — Get the active association for a user."""
        associations = Association.objects.filter(
            access_entries__user_id=user_id, access_entries__active=True
        )
        if not associations.exists():
            return Response(None, status=status.HTTP_200_OK)
        return Response(AssociationSerializer(associations.first()).data)

    @extend_schema(request=AssociationSerializer, responses=AssociationSerializer)
    def post(self, request):
        """
        POST /Association — Create a new association and link the requesting user as Chair.
        Body: {ssn, name, address, postal_code, city, user_id}
        """
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AssociationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        association = serializer.save()
        AssociationAccess.objects.create(
            user_id=user_id,
            association=association,
            role=AssociationRole.CHAIR,
            active=True,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AssociationLookupView(APIView):
    def get(self, request):
        """
        GET /Association/lookup?ssn=XXXXXXXXXX
        Scrapes skatturinn.is and returns association info for confirmation.
        """
        ssn = request.query_params.get("ssn", "").strip()

        if not ssn.isdigit() or len(ssn) != 10:
            return Response(
                {"detail": "SSN must be exactly 10 digits."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Association.objects.filter(ssn=ssn).exists():
            return Response(
                {"detail": "Þetta húsfélag er þegar skráð í kerfið."},
                status=status.HTTP_409_CONFLICT,
            )

        data = lookup_association(ssn)
        if data is None:
            return Response(
                {"detail": "Ekkert húsfélag fannst með þessa kennitölu á skatturinn.is."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(data, status=status.HTTP_200_OK)
