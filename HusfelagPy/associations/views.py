from decimal import Decimal, ROUND_DOWN
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from django.db import models as django_models
import datetime
from .models import Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership, Category, Budget, BudgetItem
from .serializers import AssociationSerializer, ApartmentSerializer, OwnershipSerializer, CategorySerializer, BudgetSerializer, BudgetItemSerializer, AssociationAccessSerializer
from .scraper import lookup_association
from users.models import User


DEFAULT_CATEGORIES = [
    ("Framkvæmdasjóður", "SHARED"),
    ("Rafmagn í sameign","SHARED"),
    ("Tryggingar",       "SHARED"),
    ("Þrif á sameign",   "SHARED"),
    ("Hitaveita",        "SHARE2"),
    ("Hiti í sameign",   "SHARE2"),
    ("Garðsláttur",      "SHARE3"),
    ("Snjómokstur",      "SHARE3"),
    ("Sorptunnuþrif",    "SHARED"),
    ("Húsfjelag.is",     "EQUAL"),
]

def _create_default_categories(association):
    """Create the default category set for a new association (skips any that already exist)."""
    existing = set(association.categories.values_list("name", flat=True))
    Category.objects.bulk_create([
        Category(association=association, name=name, type=type_)
        for name, type_ in DEFAULT_CATEGORIES
        if name not in existing
    ])


def _resolve_assoc(user_id, request):
    """
    Returns the association for this request.
    If ?as=<id> is in query params:
      - superadmin: returns any association with that id
      - regular user: returns that association only if they have active access
    Otherwise: returns the first association the user has active access to.
    """
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None

    as_id = request.query_params.get("as")
    if as_id:
        try:
            as_id = int(as_id)
        except (ValueError, TypeError):
            return None
        if user.is_superadmin:
            return Association.objects.filter(id=as_id).first()
        return Association.objects.filter(
            id=as_id,
            access_entries__user_id=user_id,
            access_entries__active=True,
        ).first()

    return Association.objects.filter(
        access_entries__user_id=user_id, access_entries__active=True
    ).first()


class AssociationView(APIView):
    @extend_schema(responses=AssociationSerializer)
    def get(self, request, user_id):
        """GET /Association/{user_id} — Get the active association for a user."""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response(None, status=status.HTTP_200_OK)
        return Response(AssociationSerializer(association).data)

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
        _create_default_categories(association)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AssociationRoleView(APIView):
    def patch(self, request, user_id):
        """
        PATCH /Association/roles/{user_id}
        Body: {role: "CHAIR"|"CFO", kennitala: "XXXXXXXXXX"}
        Assigns the user identified by kennitala to the given role in the association.
        The previous holder is demoted to MEMBER.
        """
        role = request.data.get("role", "").upper()
        kennitala = request.data.get("kennitala", "").strip().replace("-", "")

        if role not in (AssociationRole.CHAIR, AssociationRole.CFO):
            return Response({"detail": "role verður að vera CHAIR eða CFO."}, status=status.HTTP_400_BAD_REQUEST)
        if not kennitala:
            return Response({"detail": "kennitala er nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            new_user = User.objects.get(kennitala=kennitala)
        except User.DoesNotExist:
            return Response({"detail": "Notandi með þessa kennitölu fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        # Demote current holder to MEMBER
        AssociationAccess.objects.filter(
            association=association, role=role, active=True
        ).exclude(user=new_user).update(role=AssociationRole.MEMBER)

        # Assign new holder
        entry, _ = AssociationAccess.objects.get_or_create(
            user=new_user, association=association,
            defaults={"role": role, "active": True},
        )
        entry.role = role
        entry.active = True
        entry.save(update_fields=["role", "active"])

        return Response(AssociationSerializer(association).data)


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
        association = _resolve_assoc(user_id, request)
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
        size = _parse_share(request.data.get("size", 0))
        share = _parse_share(request.data.get("share", 0))
        share_2 = _parse_share(request.data.get("share_2", 0))
        share_3 = _parse_share(request.data.get("share_3", 0))

        if share is None or share_2 is None or share_3 is None:
            return Response({"detail": "Invalid share value."}, status=status.HTTP_400_BAD_REQUEST)
        if not user_id or not anr or not fnr:
            return Response({"detail": "user_id, anr, and fnr are required."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
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

        Apartment.objects.create(association=association, anr=anr, fnr=fnr, size=size or 0, share=share, share_2=share_2, share_3=share_3, share_eq=0)
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
        size = _parse_share(request.data.get("size", apartment.size))
        share = _parse_share(request.data.get("share", apartment.share))
        share_2 = _parse_share(request.data.get("share_2", apartment.share_2))
        share_3 = _parse_share(request.data.get("share_3", apartment.share_3))

        if share is None or share_2 is None or share_3 is None:
            return Response({"detail": "Invalid share value."}, status=status.HTTP_400_BAD_REQUEST)
        if not anr or not fnr:
            return Response({"detail": "anr and fnr are required."}, status=status.HTTP_400_BAD_REQUEST)

        association = apartment.association
        others = association.apartments.filter(deleted=False).exclude(id=apartment_id)
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
        apartment.size = size or 0
        apartment.share = share
        apartment.share_2 = share_2
        apartment.share_3 = share_3
        apartment.save(update_fields=["anr", "fnr", "size", "share", "share_2", "share_3"])

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
        size = _parse_share(request.data.get("size", apartment.size))
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
        apartment.size = size or 0
        apartment.share = share
        apartment.share_2 = share_2
        apartment.share_3 = share_3
        apartment.deleted = False
        apartment.save(update_fields=["anr", "fnr", "size", "share", "share_2", "share_3", "deleted"])
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
        association = _resolve_assoc(user_id, request)
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

        resolved = _resolve_assoc(requesting_user_id, request)
        if not resolved or resolved.id != apartment.association_id:
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


class CategoryView(APIView):
    def _get_association(self, user_id, request):
        return _resolve_assoc(user_id, request)

    def get(self, request, user_id):
        """GET /Category/{user_id} — List all categories for the association."""
        association = self._get_association(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)
        categories = association.categories.all().order_by("name")
        return Response(CategorySerializer(categories, many=True).data)

    def post(self, request):
        """POST /Category — Create a category. Body: {user_id, name, type}"""
        user_id = request.data.get("user_id")
        name = request.data.get("name", "").strip()
        type_ = request.data.get("type", "")

        if not name or not type_:
            return Response({"detail": "name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        association = self._get_association(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        category = Category.objects.create(association=association, name=name, type=type_)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)

    def put(self, request, category_id):
        """PUT /Category/update/{id} — Update name and/or type."""
        try:
            category = Category.objects.get(id=category_id, deleted=False)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        category.name = request.data.get("name", category.name).strip()
        category.type = request.data.get("type", category.type)
        if not category.name or not category.type:
            return Response({"detail": "name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        category.save(update_fields=["name", "type"])
        return Response(CategorySerializer(category).data)

    def delete(self, request, category_id):
        """DELETE /Category/delete/{id} — Soft-delete a category."""
        try:
            category = Category.objects.get(id=category_id, deleted=False)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        category.deleted = True
        category.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, category_id):
        """PATCH /Category/enable/{id} — Re-enable a soft-deleted category."""
        try:
            category = Category.objects.get(id=category_id, deleted=True)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        category.deleted = False
        category.save(update_fields=["deleted"])
        return Response(CategorySerializer(category).data)


def _budget_with_items(budget):
    return Budget.objects.prefetch_related("items__category").get(id=budget.id)


def _create_budget_items(budget, source_budget=None):
    """Create BudgetItems for all active categories. Copy amounts from source_budget if provided."""
    association = budget.association
    active_categories = association.categories.filter(deleted=False)
    existing_ids = set(budget.items.values_list("category_id", flat=True))

    source_amounts = {}
    if source_budget:
        source_amounts = {
            item.category_id: item.amount
            for item in source_budget.items.all()
        }

    new_items = [
        BudgetItem(
            budget=budget,
            category=cat,
            amount=source_amounts.get(cat.id, 0),
        )
        for cat in active_categories
        if cat.id not in existing_ids
    ]
    if new_items:
        BudgetItem.objects.bulk_create(new_items)


class BudgetView(APIView):
    def _get_association(self, user_id, request):
        return _resolve_assoc(user_id, request)

    def get(self, request, user_id):
        """GET /Budget/{user_id} — Return active budget, auto-creating if none exists."""
        association = self._get_association(user_id, request)
        if not association:
            return Response(None, status=status.HTTP_200_OK)

        year = datetime.date.today().year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).prefetch_related("items__category").first()

        if not budget:
            budget = Budget.objects.create(association=association, year=year, version=1, is_active=True)
            _create_budget_items(budget)
            budget = _budget_with_items(budget)

        return Response(BudgetSerializer(budget).data)

    def post(self, request):
        """
        POST /Budget — Create a new budget version for the current year.
        Deactivates the current active budget, copies its amounts to the new one.
        """
        user_id = request.data.get("user_id")
        association = self._get_association(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        year = datetime.date.today().year

        # Find latest version and deactivate it
        last_budget = Budget.objects.filter(
            association=association, year=year
        ).order_by("-version").first()

        next_version = (last_budget.version + 1) if last_budget else 1

        if last_budget:
            Budget.objects.filter(association=association, year=year).update(is_active=False)

        new_budget = Budget.objects.create(
            association=association, year=year, version=next_version, is_active=True
        )
        _create_budget_items(new_budget, source_budget=last_budget)

        return Response(BudgetSerializer(_budget_with_items(new_budget)).data, status=status.HTTP_201_CREATED)


class BudgetItemView(APIView):
    def put(self, request, item_id):
        """PUT /BudgetItem/update/{id} — Update the amount of a budget item."""
        try:
            item = BudgetItem.objects.get(id=item_id)
        except BudgetItem.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        amount = _parse_share(request.data.get("amount", item.amount))
        if amount is None or amount < 0:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)

        item.amount = amount
        item.save(update_fields=["amount"])
        item.refresh_from_db()
        return Response(BudgetItemSerializer(item).data)


class CollectionView(APIView):
    def get(self, request, user_id):
        """GET /Collection/{user_id} — Annual and monthly amounts per apartment based on active budget."""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)

        year = datetime.date.today().year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).prefetch_related("items__category").first()

        if not budget:
            return Response([], status=status.HTTP_200_OK)

        # Sum budget amounts by category type
        totals = {"SHARED": Decimal("0"), "SHARE2": Decimal("0"), "SHARE3": Decimal("0"), "EQUAL": Decimal("0")}
        for item in budget.items.all():
            if item.category and item.category.type in totals:
                totals[item.category.type] += item.amount

        apartments = association.apartments.filter(deleted=False).prefetch_related(
            "ownerships__user"
        ).order_by("anr")

        # Sum shares across all active apartments per type (should each be 100)
        share_sums = {"SHARED": Decimal("0"), "SHARE2": Decimal("0"), "SHARE3": Decimal("0"), "EQUAL": Decimal("0")}
        apt_list = list(apartments)
        for apt in apt_list:
            share_sums["SHARED"] += apt.share
            share_sums["SHARE2"] += apt.share_2
            share_sums["SHARE3"] += apt.share_3
            share_sums["EQUAL"]  += apt.share_eq

        rows = []
        for apt in apt_list:
            annual = (
                totals["SHARED"]  * apt.share    / Decimal("100") +
                totals["SHARE2"]  * apt.share_2  / Decimal("100") +
                totals["SHARE3"]  * apt.share_3  / Decimal("100") +
                totals["EQUAL"]   * apt.share_eq / Decimal("100")
            ).quantize(Decimal("1"))
            monthly = (annual / Decimal("12")).quantize(Decimal("1"))

            payer = apt.ownerships.filter(is_payer=True, deleted=False).select_related("user").first()

            shared_amt  = (totals["SHARED"] * apt.share    / Decimal("100")).quantize(Decimal("1"))
            share2_amt  = (totals["SHARE2"] * apt.share_2  / Decimal("100")).quantize(Decimal("1"))
            share3_amt  = (totals["SHARE3"] * apt.share_3  / Decimal("100")).quantize(Decimal("1"))
            equal_amt   = (totals["EQUAL"]  * apt.share_eq / Decimal("100")).quantize(Decimal("1"))

            rows.append({
                "apartment_id": apt.id,
                "anr": apt.anr,
                "fnr": apt.fnr,
                "payer_name": payer.user.name if payer else None,
                "payer_kennitala": payer.user.kennitala if payer else None,
                "payer_email": payer.user.email if payer else None,
                "shared": shared_amt,
                "share2": share2_amt,
                "share3": share3_amt,
                "equal": equal_amt,
                "annual": annual,
                "monthly": monthly,
            })

        # Budget totals per type (only for types that have budget items)
        budget_summary = [
            {"type": t, "budget": totals[t], "share_sum": share_sums[t]}
            for t in ("SHARED", "SHARE2", "SHARE3", "EQUAL")
            if totals[t] > 0
        ]

        return Response({"rows": rows, "budget_summary": budget_summary})


class AssociationListView(APIView):
    def get(self, request, user_id):
        """GET /Association/list/{user_id} — List all associations the user has access to.
        Superadmin gets all associations in the system."""
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response([], status=status.HTTP_200_OK)

        if user.is_superadmin:
            associations = Association.objects.all().order_by("name")
            serializer = AssociationAccessSerializer(associations, many=True, context={"user_id": None})
        else:
            associations = Association.objects.filter(
                access_entries__user_id=user_id, access_entries__active=True
            ).order_by("name")
            serializer = AssociationAccessSerializer(associations, many=True, context={"user_id": user_id})

        return Response(serializer.data)


class AdminAssociationView(APIView):
    def _check_superadmin(self, user_id):
        try:
            user = User.objects.get(id=user_id)
            return user if user.is_superadmin else None
        except User.DoesNotExist:
            return None

    def get(self, request):
        """GET /admin/Association?user_id=X&q=search — Search all associations."""
        user_id = request.query_params.get("user_id")
        if not self._check_superadmin(user_id):
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        q = request.query_params.get("q", "").strip()
        qs = Association.objects.all().order_by("name")
        if q:
            qs = qs.filter(
                django_models.Q(name__icontains=q) | django_models.Q(ssn__icontains=q)
            )
        return Response(AssociationAccessSerializer(qs[:50], many=True, context={"user_id": None}).data)

    def post(self, request):
        """
        POST /admin/Association — Create an association and assign a chair.
        Body: { admin_user_id, association_ssn, chair_ssn }
        Looks up association info via scraper, finds chair user by kennitala.
        """
        admin_user_id = request.data.get("admin_user_id")
        if not self._check_superadmin(admin_user_id):
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        association_ssn = str(request.data.get("association_ssn", "")).strip().replace("-", "")
        chair_ssn = str(request.data.get("chair_ssn", "")).strip().replace("-", "")

        if not association_ssn.isdigit() or len(association_ssn) != 10:
            return Response({"detail": "association_ssn verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)
        if not chair_ssn.isdigit() or len(chair_ssn) != 10:
            return Response({"detail": "chair_ssn verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)

        if Association.objects.filter(ssn=association_ssn).exists():
            return Response({"detail": "Þetta húsfélag er þegar skráð í kerfið."}, status=status.HTTP_409_CONFLICT)

        data = lookup_association(association_ssn)
        if data is None:
            return Response({"detail": "Ekkert húsfélag fannst með þessa kennitölu á skatturinn.is."}, status=status.HTTP_404_NOT_FOUND)

        try:
            chair_user = User.objects.get(kennitala=chair_ssn)
        except User.DoesNotExist:
            return Response({"detail": "Notandi með kennitölu formanns fannst ekki í kerfinu."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AssociationSerializer(data={
            "ssn": data["ssn"],
            "name": data["name"],
            "address": data["address"],
            "postal_code": data["postal_code"],
            "city": data["city"],
        })
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        association = serializer.save()
        AssociationAccess.objects.create(
            user=chair_user,
            association=association,
            role=AssociationRole.CHAIR,
            active=True,
        )
        _create_default_categories(association)
        return Response(AssociationAccessSerializer(association, context={"user_id": None}).data, status=status.HTTP_201_CREATED)
