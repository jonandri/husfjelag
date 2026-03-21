from decimal import Decimal, ROUND_DOWN
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from django.db import models as django_models
from .models import Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership
from .serializers import AssociationSerializer, ApartmentSerializer
from .scraper import lookup_association
from users.models import User


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


def _recalc_share_eq(association):
    """Recalculate equal share for all active apartments in the association."""
    apartments = list(association.apartments.filter(deleted=False))
    n = len(apartments)
    if n == 0:
        return
    unit = (Decimal("100") / n).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    remainder = Decimal("100") - unit * n
    for i, apt in enumerate(apartments):
        apt.share_eq = unit + (remainder if i == 0 else Decimal("0"))
        apt.save(update_fields=["share_eq"])


def _parse_share(value, default=None):
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except Exception:
        return default


class ApartmentView(APIView):
    def get(self, request, user_id):
        """GET /Apartment/{user_id} — List active apartments for the user's association."""
        association = Association.objects.filter(
            access_entries__user_id=user_id, access_entries__active=True
        ).first()
        if not association:
            return Response([], status=status.HTTP_200_OK)
        apartments = association.apartments.filter(deleted=False).prefetch_related("ownerships__user").all()
        return Response(ApartmentSerializer(apartments, many=True).data)

    def post(self, request):
        """
        POST /Apartment — Create a new apartment.
        Body: {user_id, anr, fnr, share, share_2}
        """
        user_id = request.data.get("user_id")
        anr = request.data.get("anr", "").strip()
        fnr = request.data.get("fnr", "").strip()
        share = _parse_share(request.data.get("share", 0))
        share_2 = _parse_share(request.data.get("share_2", 0))
        share_3 = _parse_share(request.data.get("share_3", 0))

        if share is None or share_2 is None or share_3 is None:
            return Response({"detail": "Invalid share value."}, status=status.HTTP_400_BAD_REQUEST)
        if not user_id or not anr or not fnr:
            return Response({"detail": "user_id, anr, and fnr are required."}, status=status.HTTP_400_BAD_REQUEST)

        association = Association.objects.filter(
            access_entries__user_id=user_id, access_entries__active=True
        ).first()
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        existing = association.apartments.filter(deleted=False)
        if existing.aggregate(s=django_models.Sum("share"))["s"] or Decimal("0") + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall (share) fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if existing.aggregate(s=django_models.Sum("share_2"))["s"] or Decimal("0") + share_2 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall (share 2) fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if existing.aggregate(s=django_models.Sum("share_3"))["s"] or Decimal("0") + share_3 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall (share 3) fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)

        Apartment.objects.create(association=association, anr=anr, fnr=fnr, share=share, share_2=share_2, share_3=share_3, share_eq=0)
        _recalc_share_eq(association)

        apartments = association.apartments.prefetch_related("ownerships__user").all()
        return Response(ApartmentSerializer(apartments, many=True).data, status=status.HTTP_201_CREATED)

    def put(self, request, apartment_id):
        """
        PUT /Apartment/update/{apartment_id} — Update anr, fnr, share, share_2.
        """
        try:
            apartment = Apartment.objects.get(id=apartment_id)
        except Apartment.DoesNotExist:
            return Response({"detail": "Apartment not found."}, status=status.HTTP_404_NOT_FOUND)

        anr = request.data.get("anr", apartment.anr).strip()
        fnr = request.data.get("fnr", apartment.fnr).strip()
        share = _parse_share(request.data.get("share", apartment.share))
        share_2 = _parse_share(request.data.get("share_2", apartment.share_2))
        share_3 = _parse_share(request.data.get("share_3", apartment.share_3))

        if share is None or share_2 is None or share_3 is None:
            return Response({"detail": "Invalid share value."}, status=status.HTTP_400_BAD_REQUEST)
        if not anr or not fnr:
            return Response({"detail": "anr and fnr are required."}, status=status.HTTP_400_BAD_REQUEST)

        association = apartment.association
        others = association.apartments.exclude(id=apartment_id)
        other_share = others.aggregate(s=django_models.Sum("share"))["s"] or Decimal("0")
        other_share_2 = others.aggregate(s=django_models.Sum("share_2"))["s"] or Decimal("0")
        other_share_3 = others.aggregate(s=django_models.Sum("share_3"))["s"] or Decimal("0")
        if other_share + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall (share) fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if other_share_2 + share_2 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall (share 2) fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if other_share_3 + share_3 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall (share 3) fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)

        apartment.anr = anr
        apartment.fnr = fnr
        apartment.share = share
        apartment.share_2 = share_2
        apartment.share_3 = share_3
        apartment.save(update_fields=["anr", "fnr", "share", "share_2", "share_3"])

        apartment.refresh_from_db()
        return Response(ApartmentSerializer(apartment).data)

    def delete(self, request, apartment_id):
        """DELETE /Apartment/delete/{apartment_id} — Soft-delete an apartment."""
        try:
            apartment = Apartment.objects.get(id=apartment_id, deleted=False)
        except Apartment.DoesNotExist:
            return Response({"detail": "Apartment not found."}, status=status.HTTP_404_NOT_FOUND)

        apartment.deleted = True
        apartment.save(update_fields=["deleted"])
        _recalc_share_eq(apartment.association)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApartmentOwnerView(APIView):
    def post(self, request, apartment_id):
        """
        POST /Apartment/{apartment_id}/owner — Link a user as owner by kennitala.
        Body: {kennitala, share, is_payer}
        """
        kennitala = request.data.get("kennitala", "").strip().replace("-", "")
        owner_share = Decimal(str(request.data.get("share", 100)))
        is_payer = request.data.get("is_payer", False)

        try:
            apartment = Apartment.objects.get(id=apartment_id)
        except Apartment.DoesNotExist:
            return Response({"detail": "Apartment not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            user = User.objects.get(kennitala=kennitala)
        except User.DoesNotExist:
            return Response({"detail": "Notandi með þessa kennitölu fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        _, created = ApartmentOwnership.objects.get_or_create(
            user=user, apartment=apartment,
            defaults={"share": owner_share, "is_payer": is_payer},
        )
        if not created:
            return Response({"detail": "Þessi eigandi er þegar skráður á þessa íbúð."}, status=status.HTTP_409_CONFLICT)

        return Response({"id": user.id, "name": user.name, "kennitala": user.kennitala}, status=status.HTTP_201_CREATED)

    def delete(self, request, apartment_id, owner_id):
        """DELETE /Apartment/{apartment_id}/owner/{owner_id} — Remove an owner."""
        try:
            ownership = ApartmentOwnership.objects.get(id=owner_id, apartment_id=apartment_id)
            ownership.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
