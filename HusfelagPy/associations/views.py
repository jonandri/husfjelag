from decimal import Decimal, ROUND_DOWN
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from django.db import models as django_models
from .models import Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership
from .serializers import AssociationSerializer, ApartmentSerializer, OwnershipSerializer
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


def _set_payer(apartment, ownership_id):
    """Ensure only one payer per apartment. Clears all others, sets the given ownership."""
    ApartmentOwnership.objects.filter(
        apartment=apartment, deleted=False, is_payer=True
    ).exclude(id=ownership_id).update(is_payer=False)
    ApartmentOwnership.objects.filter(id=ownership_id).update(is_payer=True)


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
        """GET /Apartment/{user_id} — List all apartments (active + disabled) for the user's association."""
        association = Association.objects.filter(
            access_entries__user_id=user_id, access_entries__active=True
        ).first()
        if not association:
            return Response([], status=status.HTTP_200_OK)
        apartments = association.apartments.prefetch_related("ownerships__user").all()
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
        agg = existing.aggregate(
            s=django_models.Sum("share"),
            s2=django_models.Sum("share_2"),
            s3=django_models.Sum("share_3"),
        )
        if (agg["s"] or Decimal("0")) + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall matshluta fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if (agg["s2"] or Decimal("0")) + share_2 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall hita fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if (agg["s3"] or Decimal("0")) + share_3 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall lóðar fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)

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
            return Response({"detail": "Heildarhlutfall matshluta fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if other_share_2 + share_2 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall hita fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if other_share_3 + share_3 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall lóðar fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)

        apartment.anr = anr
        apartment.fnr = fnr
        apartment.share = share
        apartment.share_2 = share_2
        apartment.share_3 = share_3
        apartment.save(update_fields=["anr", "fnr", "share", "share_2", "share_3"])

        apartment.refresh_from_db()
        return Response(ApartmentSerializer(apartment).data)

    def delete(self, request, apartment_id):
        """DELETE /Apartment/delete/{apartment_id} — Disable an apartment."""
        try:
            apartment = Apartment.objects.get(id=apartment_id, deleted=False)
        except Apartment.DoesNotExist:
            return Response({"detail": "Apartment not found."}, status=status.HTTP_404_NOT_FOUND)

        apartment.deleted = True
        apartment.save(update_fields=["deleted"])
        _recalc_share_eq(apartment.association)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, apartment_id):
        """PATCH /Apartment/enable/{apartment_id} — Re-enable a disabled apartment with validation."""
        try:
            apartment = Apartment.objects.get(id=apartment_id, deleted=True)
        except Apartment.DoesNotExist:
            return Response({"detail": "Disabled apartment not found."}, status=status.HTTP_404_NOT_FOUND)

        anr = request.data.get("anr", apartment.anr).strip()
        fnr = request.data.get("fnr", apartment.fnr).strip()
        share = _parse_share(request.data.get("share", apartment.share))
        share_2 = _parse_share(request.data.get("share_2", apartment.share_2))
        share_3 = _parse_share(request.data.get("share_3", apartment.share_3))

        if share is None or share_2 is None or share_3 is None:
            return Response({"detail": "Invalid share value."}, status=status.HTTP_400_BAD_REQUEST)

        association = apartment.association
        active = association.apartments.filter(deleted=False)
        agg = active.aggregate(
            s=django_models.Sum("share"),
            s2=django_models.Sum("share_2"),
            s3=django_models.Sum("share_3"),
        )
        if (agg["s"] or Decimal("0")) + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall matshluta fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if (agg["s2"] or Decimal("0")) + share_2 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall hita fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)
        if (agg["s3"] or Decimal("0")) + share_3 > Decimal("100"):
            return Response({"detail": "Heildarhlutfall lóðar fer yfir 100%."}, status=status.HTTP_400_BAD_REQUEST)

        apartment.anr = anr
        apartment.fnr = fnr
        apartment.share = share
        apartment.share_2 = share_2
        apartment.share_3 = share_3
        apartment.deleted = False
        apartment.save(update_fields=["anr", "fnr", "share", "share_2", "share_3", "deleted"])
        _recalc_share_eq(association)
        apartment.refresh_from_db()
        return Response(ApartmentSerializer(apartment).data)


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

        user, _ = User.objects.get_or_create(
            kennitala=kennitala,
            defaults={"name": kennitala},
        )

        _, created = ApartmentOwnership.objects.get_or_create(
            user=user, apartment=apartment,
            defaults={"share": owner_share, "is_payer": is_payer},
        )
        if not created:
            return Response({"detail": "Þessi eigandi er þegar skráður á þessa íbúð."}, status=status.HTTP_409_CONFLICT)

        return Response({"id": user.id, "name": user.name, "kennitala": user.kennitala}, status=status.HTTP_201_CREATED)

    def delete(self, request, apartment_id, owner_id):
        """DELETE /Apartment/{apartment_id}/owner/{owner_id} — Soft-disable an owner."""
        try:
            ownership = ApartmentOwnership.objects.get(id=owner_id, apartment_id=apartment_id, deleted=False)
            ownership.deleted = True
            ownership.save(update_fields=["deleted"])
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)


class OwnerView(APIView):
    def get(self, request, user_id):
        """GET /Owner/{user_id} — List all ownerships for the user's association."""
        association = Association.objects.filter(
            access_entries__user_id=user_id, access_entries__active=True
        ).first()
        if not association:
            return Response([], status=status.HTTP_200_OK)
        ownerships = ApartmentOwnership.objects.filter(
            apartment__association=association
        ).select_related("user", "apartment").order_by("apartment__anr", "user__name")
        return Response(OwnershipSerializer(ownerships, many=True).data)

    def post(self, request):
        """POST /Owner — Create ownership. Body: {user_id, kennitala, apartment_id, share, is_payer}"""
        requesting_user_id = request.data.get("user_id")
        kennitala = request.data.get("kennitala", "").strip().replace("-", "")
        apartment_id = request.data.get("apartment_id")
        share = _parse_share(request.data.get("share", 0))
        is_payer = request.data.get("is_payer", False)

        if not kennitala or not apartment_id or share is None:
            return Response({"detail": "kennitala, apartment_id og share eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            apartment = Apartment.objects.get(id=apartment_id, deleted=False)
        except Apartment.DoesNotExist:
            return Response({"detail": "Íbúð fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        if not Association.objects.filter(
            id=apartment.association_id,
            access_entries__user_id=requesting_user_id,
            access_entries__active=True,
        ).exists():
            return Response({"detail": "Aðgangur hafnaður."}, status=status.HTTP_403_FORBIDDEN)

        owner, created = User.objects.get_or_create(
            kennitala=kennitala,
            defaults={"name": kennitala},  # placeholder until they log in via Kenni
        )

        existing = ApartmentOwnership.objects.filter(user=owner, apartment=apartment).first()
        if existing and not existing.deleted:
            return Response({"detail": "Þessi eigandi er þegar skráður á þessa íbúð."}, status=status.HTTP_409_CONFLICT)

        active_ownerships = ApartmentOwnership.objects.filter(apartment=apartment, deleted=False)
        current_sum = active_ownerships.aggregate(s=django_models.Sum("share"))["s"] or Decimal("0")
        if current_sum + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall eigenda fer yfir 100% fyrir þessa íbúð."}, status=status.HTTP_400_BAD_REQUEST)

        # First owner always becomes payer
        is_first = not active_ownerships.exists()
        effective_payer = is_first or is_payer

        if existing and existing.deleted:
            existing.share = share
            existing.is_payer = effective_payer
            existing.deleted = False
            existing.save(update_fields=["share", "is_payer", "deleted"])
            if effective_payer:
                _set_payer(apartment, existing.id)
            return Response(OwnershipSerializer(existing).data, status=status.HTTP_200_OK)

        ownership = ApartmentOwnership.objects.create(
            user=owner, apartment=apartment, share=share, is_payer=effective_payer
        )
        if effective_payer:
            _set_payer(apartment, ownership.id)
        return Response(OwnershipSerializer(ownership).data, status=status.HTTP_201_CREATED)

    def put(self, request, ownership_id):
        """PUT /Owner/update/{ownership_id} — Update share of an active ownership."""
        try:
            ownership = ApartmentOwnership.objects.get(id=ownership_id, deleted=False)
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Eignarhald fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        share = _parse_share(request.data.get("share", ownership.share))
        if share is None:
            return Response({"detail": "Invalid share."}, status=status.HTTP_400_BAD_REQUEST)

        is_payer = request.data.get("is_payer", ownership.is_payer)

        others = ApartmentOwnership.objects.filter(
            apartment=ownership.apartment, deleted=False
        ).exclude(id=ownership_id)
        other_sum = others.aggregate(s=django_models.Sum("share"))["s"] or Decimal("0")
        if other_sum + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall eigenda fer yfir 100% fyrir þessa íbúð."}, status=status.HTTP_400_BAD_REQUEST)

        ownership.share = share
        ownership.is_payer = is_payer
        ownership.save(update_fields=["share", "is_payer"])
        if is_payer:
            _set_payer(ownership.apartment, ownership_id)
        ownership.refresh_from_db()
        return Response(OwnershipSerializer(ownership).data)

    def delete(self, request, ownership_id):
        """DELETE /Owner/delete/{ownership_id} — Soft-disable an ownership."""
        try:
            ownership = ApartmentOwnership.objects.get(id=ownership_id, deleted=False)
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ownership.deleted = True
        ownership.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, ownership_id):
        """PATCH /Owner/enable/{ownership_id} — Re-enable an ownership with validation."""
        try:
            ownership = ApartmentOwnership.objects.get(id=ownership_id, deleted=True)
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Óvirkt eignarhald fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        share = _parse_share(request.data.get("share", ownership.share))
        if share is None:
            return Response({"detail": "Invalid share."}, status=status.HTTP_400_BAD_REQUEST)

        is_payer = request.data.get("is_payer", ownership.is_payer)

        active = ApartmentOwnership.objects.filter(apartment=ownership.apartment, deleted=False)
        current_sum = active.aggregate(s=django_models.Sum("share"))["s"] or Decimal("0")
        if current_sum + share > Decimal("100"):
            return Response({"detail": "Heildarhlutfall eigenda fer yfir 100% fyrir þessa íbúð."}, status=status.HTTP_400_BAD_REQUEST)

        # If no active owners remain, this re-enabled owner becomes payer automatically
        if not active.exists():
            is_payer = True

        ownership.share = share
        ownership.is_payer = is_payer
        ownership.deleted = False
        ownership.save(update_fields=["share", "is_payer", "deleted"])
        if is_payer:
            _set_payer(ownership.apartment, ownership_id)
        ownership.refresh_from_db()
        return Response(OwnershipSerializer(ownership).data)
