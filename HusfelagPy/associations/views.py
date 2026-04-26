import re
import unicodedata
from decimal import Decimal, ROUND_DOWN
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema

from django.db import models as django_models, transaction
from rest_framework.permissions import IsAuthenticated
import datetime
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, CategoryType, Budget, BudgetItem, HMSImportSource,
    AccountingKey, AccountingKeyType, BankAccount, Transaction, TransactionStatus,
    CategoryRule, Collection, CollectionStatus, AssociationBankSettings,
    RegistrationRequest, RegistrationRequestStatus,
)
from .serializers import (
    AssociationSerializer, ApartmentSerializer, OwnershipSerializer,
    CategorySerializer, BudgetSerializer, BudgetItemSerializer, AssociationAccessSerializer,
    AccountingKeySerializer, BankAccountSerializer, TransactionSerializer,
)
from .scraper import lookup_association, scrape_hms_apartments
from .skattur_cloud import fetch_legal_entity, extract_prokuruhafar, parse_entity_for_association
from .importers import BANK_PARSERS, detect_bank, detect_duplicates
from .categoriser import build_categorisation_context, categorise_row
from users.models import User


def _norm(s):
    """Strip diacritics and lowercase for fuzzy Icelandic search."""
    return unicodedata.normalize('NFKD', str(s).lower()).encode('ascii', 'ignore').decode()


def _matches(name, q):
    """
    True if every word in the (normalized) query is a substring of any word
    in the (normalized) name.  Handles Icelandic case endings gracefully:
      'mariugata' matches 'mariugotu' because the shared 7-char prefix is ≥4.
    """
    name_norm = _norm(name)
    q_words = _norm(q).split()
    name_words = name_norm.split()
    for qw in q_words:
        if len(qw) < 3:
            continue
        # Match if qw is a substring of any name word, or vice-versa
        if not any(qw in nw or nw.startswith(qw[:max(4, len(qw)-2)]) for nw in name_words):
            return False
    return True


def _can_access_assoc(request, association):
    """True if request.user has active access to this association (or is superadmin)."""
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return False
    if user.is_superadmin:
        return True
    return AssociationAccess.objects.filter(
        user_id=user.id, association=association, active=True
    ).exists()


def _get_role(request, association):
    """Return the user's role string for this association, or None if no access."""
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return None
    if user.is_superadmin:
        return AssociationRole.CHAIR  # superadmin has full access
    entry = AssociationAccess.objects.filter(
        user_id=user.id, association=association, active=True
    ).first()
    return entry.role if entry else None


def _require_chair_or_cfo(request, association):
    """Returns a 403 Response if the user is not CHAIR or CFO, else None."""
    role = _get_role(request, association)
    if role not in (AssociationRole.CHAIR, AssociationRole.CFO):
        return Response({"detail": "Aðeins stjórnendur félagsins hafa aðgang að þessari aðgerð."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _require_chair(request, association):
    """Returns a 403 Response if the user is not CHAIR, else None."""
    role = _get_role(request, association)
    if role != AssociationRole.CHAIR:
        return Response({"detail": "Aðeins formaður félagsins getur framkvæmt þessa aðgerð."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _resolve_assoc(user_id, request):
    """
    Returns the association for this request.
    The authenticated user (request.user) is always the authority —
    user_id in the URL is validated against request.user to prevent
    horizontal privilege escalation.

    If ?as=<id> is in query params:
      - superadmin: returns any association with that id
      - regular user: returns that association only if they have active access
    Otherwise: returns the first association the user has active access to.
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None

    # Reject if the URL user_id doesn't match the authenticated user
    # (unless superadmin, who can act on behalf of any user).
    if not user.is_superadmin and user.id != user_id:
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
            access_entries__user_id=user.id,
            access_entries__active=True,
        ).first()

    return Association.objects.filter(
        access_entries__user_id=user.id, access_entries__active=True
    ).first()


def _normalize_acct(s):
    """Strip hyphens and spaces from an account number string for comparison."""
    return re.sub(r'[\s\-]', '', str(s or ''))


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
        POST /Association — Create a new association (self-service).
        Verifies that the requesting user holds power of attorney (Prókúruhafi)
        via the Icelandic company registry API before creating.
        Body: {ssn}
        """
        ssn = str(request.data.get("ssn", "")).strip().replace("-", "")
        if not ssn.isdigit() or len(ssn) != 10:
            return Response({"detail": "ssn verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user

        if Association.objects.filter(ssn=ssn).exists():
            return Response({"detail": "Þetta húsfélag er þegar skráð í kerfið."}, status=status.HTTP_409_CONFLICT)

        entity = fetch_legal_entity(ssn)
        if entity is None:
            return Response(
                {"detail": "Ekki tókst að ná sambandi við Skattur Cloud. Reyndu aftur síðar."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        prokuruhafar = extract_prokuruhafar(entity)
        if not any(p["national_id"] == user.kennitala for p in prokuruhafar):
            return Response(
                {"detail": "Þú ert ekki prókúruhafi fyrir þetta félag."},
                status=status.HTTP_403_FORBIDDEN,
            )

        fields = parse_entity_for_association(ssn, entity)

        try:
            with transaction.atomic():
                association = Association.objects.create(
                    ssn=fields["ssn"],
                    name=fields["name"],
                    address=fields["address"],
                    postal_code=fields["postal_code"],
                    city=fields["city"],
                    date_of_board_change=fields["date_of_board_change"],
                    registered=fields["registered"],
                    status=fields["status"],
                )
                AssociationAccess.objects.create(
                    user=user,
                    association=association,
                    role=AssociationRole.CHAIR,
                    active=True,
                )
        except Exception:
            # Race condition: another request created it between our check and insert
            if Association.objects.filter(ssn=ssn).exists():
                return Response({"detail": "Þetta húsfélag er þegar skráð í kerfið."}, status=status.HTTP_409_CONFLICT)
            raise

        return Response(AssociationSerializer(association).data, status=status.HTTP_201_CREATED)


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

        err = _require_chair(request, association)
        if err:
            return err

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


class AssociationVerifyView(APIView):
    def get(self, request):
        """
        GET /Association/verify?ssn=XXXXXXXXXX
        Fetches company registry data and checks if the requesting user is a
        Prókúruhafi (power of attorney holder) for the association.
        Returns preview data plus authorized: true/false.
        Always returns 200 so the frontend can show the negative state gracefully.
        """
        ssn = request.query_params.get("ssn", "").strip().replace("-", "")

        if not ssn.isdigit() or len(ssn) != 10:
            return Response({"detail": "ssn verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user

        already_registered = Association.objects.filter(ssn=ssn).exists()

        entity = fetch_legal_entity(ssn)
        if entity is None:
            return Response(
                {"detail": "Ekki tókst að ná sambandi við Skattur Cloud. Reyndu aftur síðar."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        prokuruhafar = extract_prokuruhafar(entity)
        authorized = any(p["national_id"] == user.kennitala for p in prokuruhafar)
        fields = parse_entity_for_association(ssn, entity)

        return Response({
            **fields,
            "prokuruhafar": prokuruhafar,
            "authorized": authorized,
            "already_registered": already_registered,
        })


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

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

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

        err = _require_chair_or_cfo(request, apartment.association)
        if err:
            return err

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

        err = _require_chair_or_cfo(request, apartment.association)
        if err:
            return err

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

        err = _require_chair_or_cfo(request, apartment.association)
        if err:
            return err

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

        err = _require_chair_or_cfo(request, apartment.association)
        if err:
            return err

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
            ownership = ApartmentOwnership.objects.select_related("apartment__association").get(
                id=owner_id, apartment_id=apartment_id, deleted=False
            )
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, ownership.apartment.association)
        if err:
            return err

        ownership.deleted = True
        ownership.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)


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
            ownership = ApartmentOwnership.objects.select_related("apartment__association").get(
                id=ownership_id, deleted=False
            )
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Eignarhald fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, ownership.apartment.association)
        if err:
            return err

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
            ownership = ApartmentOwnership.objects.select_related("apartment__association").get(
                id=ownership_id, deleted=False
            )
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, ownership.apartment.association)
        if err:
            return err

        ownership.deleted = True
        ownership.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, ownership_id):
        """PATCH /Owner/enable/{ownership_id} — Re-enable an ownership with validation."""
        try:
            ownership = ApartmentOwnership.objects.select_related("apartment__association").get(
                id=ownership_id, deleted=True
            )
        except ApartmentOwnership.DoesNotExist:
            return Response({"detail": "Óvirkt eignarhald fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, ownership.apartment.association)
        if err:
            return err

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


class CategoryListView(APIView):

    def get(self, request):
        """GET /Category/list — all active global categories, no scoping."""
        categories = Category.objects.filter(deleted=False).order_by("name")
        return Response(CategorySerializer(categories, many=True).data)


class AccountingKeyListView(APIView):

    def get(self, request):
        """GET /AccountingKey/list — all active keys (no auth required)."""
        keys = AccountingKey.objects.filter(deleted=False)
        return Response(AccountingKeySerializer(keys, many=True).data)


class AccountingKeyView(APIView):
    def _require_superadmin(self, request):
        """Returns None if superadmin, otherwise a 403 Response."""
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar geta breytt bókhaldslyklum."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request, user_id):
        """GET /AccountingKey/{user_id} — all keys including deleted (superadmin panel)."""
        keys = AccountingKey.objects.all()
        return Response(AccountingKeySerializer(keys, many=True).data)

    def post(self, request):
        """POST /AccountingKey — create a key. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        number = request.data.get("number")
        name = request.data.get("name", "").strip()
        type_ = request.data.get("type", "")

        if number is None or not name or not type_:
            return Response({"detail": "number, name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        if type_ not in AccountingKeyType.values:
            return Response({"detail": "Ógildur lykilflokkur."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            number = int(number)
        except (TypeError, ValueError):
            return Response({"detail": "number verður að vera heiltala."}, status=status.HTTP_400_BAD_REQUEST)

        if AccountingKey.objects.filter(number=number).exists():
            return Response({"detail": "Bókhaldslykill með þetta númer er þegar til."}, status=status.HTTP_400_BAD_REQUEST)

        key = AccountingKey.objects.create(number=number, name=name, type=type_)
        return Response(AccountingKeySerializer(key).data, status=status.HTTP_201_CREATED)

    def put(self, request, key_id):
        """PUT /AccountingKey/update/{id} — update name/type. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        try:
            key = AccountingKey.objects.get(id=key_id)
        except AccountingKey.DoesNotExist:
            return Response({"detail": "Bókhaldslykill fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        key.name = request.data.get("name", key.name).strip()
        key.type = request.data.get("type", key.type)
        if not key.name or not key.type:
            return Response({"detail": "name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        if key.type not in AccountingKeyType.values:
            return Response({"detail": "Ógildur lykilflokkur."}, status=status.HTTP_400_BAD_REQUEST)
        key.save(update_fields=["name", "type"])
        return Response(AccountingKeySerializer(key).data)

    def delete(self, request, key_id):
        """DELETE /AccountingKey/delete/{id} — soft-delete. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        try:
            key = AccountingKey.objects.get(id=key_id, deleted=False)
        except AccountingKey.DoesNotExist:
            return Response({"detail": "Bókhaldslykill fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        key.deleted = True
        key.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, key_id):
        """PATCH /AccountingKey/enable/{id} — re-enable. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        try:
            key = AccountingKey.objects.get(id=key_id, deleted=True)
        except AccountingKey.DoesNotExist:
            return Response({"detail": "Bókhaldslykill fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        key.deleted = False
        key.save(update_fields=["deleted"])
        return Response(AccountingKeySerializer(key).data)


class BankAccountView(APIView):
    def get(self, request, user_id):
        """GET /BankAccount/{user_id} — list active bank accounts for the association."""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err
        bank_accounts = (
            association.bank_accounts
            .filter(deleted=False)
            .select_related("asset_account")
            .annotate(current_balance=django_models.Sum("transactions__amount"))
        )
        return Response(BankAccountSerializer(bank_accounts, many=True).data)

    def post(self, request):
        """POST /BankAccount — create a bank account."""
        user_id = request.data.get("user_id")
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        name = request.data.get("name", "").strip()
        account_number = request.data.get("account_number", "").strip()
        description = request.data.get("description", "").strip()
        asset_account_id = request.data.get("asset_account_id")

        if not name or not account_number:
            return Response({"detail": "name og account_number eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        asset_account = None
        if asset_account_id:
            try:
                asset_account = AccountingKey.objects.get(id=asset_account_id, deleted=False)
            except AccountingKey.DoesNotExist:
                return Response({"detail": "Bókhaldslykill fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        bank_account = BankAccount.objects.create(
            association=association,
            name=name,
            account_number=account_number,
            asset_account=asset_account,
            description=description,
        )
        return Response(BankAccountSerializer(bank_account).data, status=status.HTTP_201_CREATED)

    def put(self, request, bank_account_id):
        """PUT /BankAccount/update/{id} — update. Body: {user_id, name, account_number, asset_account_id, description}."""
        user_id = request.data.get("user_id")
        try:
            bank_account = BankAccount.objects.select_related("asset_account").get(id=bank_account_id, deleted=False)
        except BankAccount.DoesNotExist:
            return Response({"detail": "Bankareikningur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        association = _resolve_assoc(user_id, request)
        if not association or association.id != bank_account.association_id:
            return Response({"detail": "Aðgangur hafnaður."}, status=status.HTTP_403_FORBIDDEN)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank_account.name = request.data.get("name", bank_account.name).strip()
        bank_account.account_number = request.data.get("account_number", bank_account.account_number).strip()
        bank_account.description = request.data.get("description", bank_account.description).strip()

        if "asset_account_id" in request.data:
            asset_account_id = request.data.get("asset_account_id")
            if asset_account_id is None:
                bank_account.asset_account = None
            else:
                try:
                    bank_account.asset_account = AccountingKey.objects.get(id=asset_account_id, deleted=False)
                except AccountingKey.DoesNotExist:
                    return Response({"detail": "Bókhaldslykill fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        bank_account.save(update_fields=["name", "account_number", "description", "asset_account"])
        return Response(BankAccountSerializer(bank_account).data)

    def delete(self, request, bank_account_id):
        """DELETE /BankAccount/delete/{id} — soft-delete. Body: {user_id}."""
        user_id = request.data.get("user_id")
        try:
            bank_account = BankAccount.objects.get(id=bank_account_id, deleted=False)
        except BankAccount.DoesNotExist:
            return Response({"detail": "Bankareikningur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        association = _resolve_assoc(user_id, request)
        if not association or association.id != bank_account.association_id:
            return Response({"detail": "Aðgangur hafnaður."}, status=status.HTTP_403_FORBIDDEN)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank_account.deleted = True
        bank_account.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class TransactionView(APIView):
    def get(self, request, user_id):
        """GET /Transaction/{user_id} — list transactions. Query: ?year=, ?bank_account_id=, ?status="""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank_account_ids = list(
            association.bank_accounts.filter(deleted=False).values_list("id", flat=True)
        )
        if not bank_account_ids:
            return Response([], status=status.HTTP_200_OK)

        qs = Transaction.objects.filter(bank_account_id__in=bank_account_ids).select_related(
            "bank_account", "category"
        )

        year = request.query_params.get("year")
        if year:
            try:
                qs = qs.filter(date__year=int(year))
            except (ValueError, TypeError):
                pass

        bank_account_id = request.query_params.get("bank_account_id")
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(TransactionSerializer(qs, many=True).data)

    def post(self, request):
        """POST /Transaction — create a manual transaction."""
        user_id = request.data.get("user_id")
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank_account_id = request.data.get("bank_account_id")
        date_str = request.data.get("date")
        amount = request.data.get("amount")
        description = request.data.get("description", "").strip()
        reference = request.data.get("reference", "").strip()
        category_id = request.data.get("category_id")

        if not bank_account_id or not date_str or amount is None or not description:
            return Response(
                {"detail": "bank_account_id, date, amount og description eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            bank_account = BankAccount.objects.get(
                id=bank_account_id, deleted=False, association=association
            )
        except BankAccount.DoesNotExist:
            return Response({"detail": "Aðgangur hafnaður."}, status=status.HTTP_403_FORBIDDEN)

        try:
            amount = Decimal(str(amount))
        except Exception:
            return Response({"detail": "Ógilt upphæðargildi."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            date_parsed = datetime.date.fromisoformat(date_str)
        except (ValueError, TypeError):
            return Response({"detail": "Ógild dagsetning. Notaðu YYYY-MM-DD snið."}, status=status.HTTP_400_BAD_REQUEST)

        category = None
        if category_id:
            try:
                category = Category.objects.get(id=category_id, deleted=False)
            except Category.DoesNotExist:
                return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        tx = Transaction.objects.create(
            bank_account=bank_account,
            date=date_parsed,
            amount=amount,
            description=description,
            reference=reference,
            category=category,
            status=TransactionStatus.CATEGORISED if category else TransactionStatus.IMPORTED,
        )
        return Response(TransactionSerializer(tx).data, status=status.HTTP_201_CREATED)

    def patch(self, request, transaction_id):
        """PATCH /Transaction/categorise/{id} — assign category. Body: {user_id, category_id}."""
        user_id = request.data.get("user_id")
        category_id = request.data.get("category_id")

        if not category_id:
            return Response({"detail": "category_id er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tx = Transaction.objects.select_related("bank_account").get(id=transaction_id)
        except Transaction.DoesNotExist:
            return Response({"detail": "Færsla fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        association = _resolve_assoc(user_id, request)
        if not association or association.id != tx.bank_account.association_id:
            return Response({"detail": "Aðgangur hafnaður."}, status=status.HTTP_403_FORBIDDEN)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            category = Category.objects.get(id=category_id, deleted=False)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        tx.category = category
        tx.status = TransactionStatus.CATEGORISED
        tx.save(update_fields=["category", "status"])
        tx.refresh_from_db()
        return Response(TransactionSerializer(tx).data)


class ImportPreviewView(APIView):
    def post(self, request):
        """POST /Import/preview — parse uploaded statement, skip duplicates, return preview."""
        user_id = request.data.get("user_id")
        bank_account_id = request.data.get("bank_account_id")
        bank = str(request.data.get("bank") or "").strip().lower()
        file = request.FILES.get("file")

        if not all([user_id, bank_account_id, bank, file]):
            return Response(
                {"detail": "user_id, bank_account_id, bank og file eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = int(user_id)
            bank_account_id = int(bank_account_id)
        except (ValueError, TypeError):
            return Response(
                {"detail": "user_id og bank_account_id verða að vera tölur."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if bank not in BANK_PARSERS:
            return Response({"detail": "Óþekktur banki."}, status=status.HTTP_400_BAD_REQUEST)

        ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
        if ext not in ('csv', 'xlsx'):
            return Response(
                {"detail": "Aðeins .csv og .xlsx skrár eru studdar."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            bank_account = BankAccount.objects.get(
                id=bank_account_id, deleted=False, association=association
            )
        except BankAccount.DoesNotExist:
            return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)

        try:
            result = BANK_PARSERS[bank](file, ext)
        except Exception:
            return Response(
                {"detail": "Gat ekki lesið skrána. Athugaðu að rétt bankaskrá sé valin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_acct = result.get("file_account_number")
        if file_acct is not None:
            if _normalize_acct(file_acct) != _normalize_acct(bank_account.account_number):
                return Response(
                    {"detail": "Skráin tilheyrir öðrum bankareikningi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        all_rows = result.get("rows", [])
        to_import_rows, skipped = detect_duplicates(all_rows, bank_account)

        serialized = [
            {
                "date":            r["date"].isoformat(),
                "amount":          str(r["amount"]),
                "description":     r["description"],
                "reference":       r["reference"],
                "payer_kennitala": r.get("payer_kennitala", ""),
            }
            for r in to_import_rows
        ]

        return Response({
            "total_in_file":      len(all_rows),
            "to_import":          len(to_import_rows),
            "skipped_duplicates": skipped,
            "rows":               serialized,
        })


class ImportDetectView(APIView):
    def post(self, request):
        """POST /Import/detect — detect bank and account number from a statement file.
        Body: multipart with `file`. Returns {bank, file_account_number}.
        """
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "file er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)
        ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
        if ext not in ("csv", "xlsx"):
            return Response({"detail": "Aðeins .csv og .xlsx skrár eru studdar."}, status=status.HTTP_400_BAD_REQUEST)
        result = detect_bank(file, ext)
        return Response(result)


def _husgjold_category():
    """Return the 'Tekjur af húsgjöldum' category (income_account 4100), or None."""
    return Category.objects.filter(
        income_account__number=4100, deleted=False
    ).first()


def _owner_kennitala_set(association):
    """Return a set of kennitala strings for all active owners in the association."""
    return set(
        ApartmentOwnership.objects.filter(
            apartment__association=association,
            deleted=False,
        ).values_list("user__kennitala", flat=True)
    )


def _auto_match_collections(transactions, association):
    """Auto-match positive income transactions to PENDING collection items by payer kennitala.
    If no matching collection exists but payer is an owner, categorise as Tekjur af húsgjöldum."""
    hussjoður_cat = Category.objects.filter(type=CategoryType.INCOME, name="Hússjóður", deleted=False).first()
    husgjold_cat = _husgjold_category()
    owner_kennitala = _owner_kennitala_set(association)
    to_update_txs = []
    to_update_cols = []
    for tx in transactions:
        if tx.amount <= 0 or not tx.payer_kennitala:
            continue
        try:
            payer = User.objects.get(kennitala=tx.payer_kennitala)
        except User.DoesNotExist:
            continue
        col = Collection.objects.filter(
            budget__association=association,
            budget__year=tx.date.year,
            budget__is_active=True,
            payer=payer,
            month=tx.date.month,
            status=CollectionStatus.PENDING,
            paid_transaction__isnull=True,
        ).first()
        if col:
            col.paid_transaction = tx
            col.status = CollectionStatus.PAID
            tx.status = TransactionStatus.RECONCILED
            if hussjoður_cat:
                tx.category = hussjoður_cat
            to_update_cols.append(col)
            to_update_txs.append(tx)
        elif tx.payer_kennitala in owner_kennitala and husgjold_cat and tx.category is None:
            tx.category = husgjold_cat
            tx.status = TransactionStatus.CATEGORISED
            to_update_txs.append(tx)
    if to_update_cols:
        with transaction.atomic():
            Collection.objects.bulk_update(to_update_cols, ["paid_transaction", "status"])
    if to_update_txs:
        with transaction.atomic():
            Transaction.objects.bulk_update(to_update_txs, ["status", "category"])


class ImportConfirmView(APIView):
    def post(self, request):
        """POST /Import/confirm — bulk-create transactions from confirmed rows."""
        user_id = request.data.get("user_id")
        bank_account_id = request.data.get("bank_account_id")
        rows = request.data.get("rows", [])

        if not user_id or not bank_account_id:
            return Response(
                {"detail": "user_id og bank_account_id eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = int(user_id)
            bank_account_id = int(bank_account_id)
        except (ValueError, TypeError):
            return Response(
                {"detail": "user_id og bank_account_id verða að vera tölur."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            bank_account = BankAccount.objects.get(
                id=bank_account_id, deleted=False, association=association
            )
        except BankAccount.DoesNotExist:
            return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)

        try:
            rules, history = build_categorisation_context(association)
        except Exception:
            rules, history = [], {}

        transactions = []
        for row in rows:
            try:
                description = str(row.get("description") or "")
                date = datetime.date.fromisoformat(row["date"])
                amount = Decimal(str(row["amount"]))
            except (KeyError, ValueError, TypeError):
                continue

            cat = categorise_row(description, rules, history)
            tx_status = TransactionStatus.CATEGORISED if cat else TransactionStatus.IMPORTED
            transactions.append(Transaction(
                bank_account=bank_account,
                date=date,
                amount=amount,
                description=description,
                reference=str(row.get("reference") or ""),
                payer_kennitala=str(row.get("payer_kennitala") or ""),
                category=cat,
                status=tx_status,
            ))

        created_transactions = Transaction.objects.bulk_create(transactions)
        _auto_match_collections(created_transactions, association)
        return Response({"created": len(transactions)}, status=status.HTTP_201_CREATED)


class ImportRecategoriseView(APIView):
    def post(self, request):
        """POST /Import/recategorise — re-run auto-categorisation on all IMPORTED (uncategorised)
        transactions for the association. Superadmin only.
        Supports ?as= for superadmin impersonation.
        Returns {categorised, total}.
        """
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins superadmin getur keyrt þetta."}, status=status.HTTP_403_FORBIDDEN)

        association = _resolve_assoc(request.user.id, request)
        if not association:
            return Response({"detail": "Félag fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        bank_account_ids = list(
            association.bank_accounts.filter(deleted=False).values_list("id", flat=True)
        )
        txs = list(
            Transaction.objects.filter(
                bank_account_id__in=bank_account_ids,
                status=TransactionStatus.IMPORTED,
            )
        )

        if not txs:
            return Response({"categorised": 0, "total": 0})

        try:
            rules, history = build_categorisation_context(association)
        except Exception:
            rules, history = [], {}

        husgjold_cat = _husgjold_category()
        owner_kennitala = _owner_kennitala_set(association)

        to_update = []
        for tx in txs:
            cat = categorise_row(str(tx.description or ""), rules, history)
            if not cat and husgjold_cat and tx.payer_kennitala and tx.payer_kennitala in owner_kennitala and tx.amount > 0:
                cat = husgjold_cat
            if cat:
                tx.category = cat
                tx.status = TransactionStatus.CATEGORISED
                to_update.append(tx)

        if to_update:
            Transaction.objects.bulk_update(to_update, ["category", "status"])

        return Response({"categorised": len(to_update), "total": len(txs)})


class CategoryRuleView(APIView):
    def get(self, request, user_id):
        """GET /CategoryRule/<user_id> — list association + global rules."""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"association_rules": [], "global_rules": []})

        assoc_rules = CategoryRule.objects.filter(
            association=association, deleted=False
        ).select_related("category")
        global_rules = CategoryRule.objects.filter(
            association__isnull=True, deleted=False
        ).select_related("category")

        def _ser(rule, is_global=False):
            return {
                "id": rule.id,
                "keyword": rule.keyword,
                "category": {"id": rule.category.id, "name": rule.category.name},
                "is_global": is_global,
            }

        return Response({
            "association_rules": [_ser(r, False) for r in assoc_rules],
            "global_rules":      [_ser(r, True)  for r in global_rules],
        })

    def _check_rule_access(self, request, rule):
        """Returns a 403 Response if request.user cannot modify this rule, else None."""
        if rule.association is not None:
            return _require_chair_or_cfo(request, rule.association)
        else:
            if not request.user.is_superadmin:
                return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def post(self, request):
        """POST /CategoryRule — create a rule."""
        keyword     = request.data.get("keyword", "").strip()
        category_id = request.data.get("category_id")
        is_global   = bool(request.data.get("is_global", False))

        if not keyword or not category_id:
            return Response(
                {"detail": "keyword og category_id eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            category = Category.objects.get(id=int(category_id), deleted=False)
        except (Category.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        if is_global:
            if not request.user.is_superadmin:
                return Response(
                    {"detail": "Aðeins stjórnendur geta búið til almennar reglur."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            assoc = None
        else:
            assoc = _resolve_assoc(request.user.id, request)
            if not assoc:
                return Response({"detail": "Félag fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        rule = CategoryRule.objects.create(keyword=keyword, category=category, association=assoc)
        return Response(
            {"id": rule.id, "keyword": rule.keyword,
             "category": {"id": category.id, "name": category.name}, "is_global": is_global},
            status=status.HTTP_201_CREATED,
        )

    def put(self, request, rule_id):
        """PUT /CategoryRule/update/<rule_id> — update keyword and/or category."""
        keyword     = request.data.get("keyword", "").strip()
        category_id = request.data.get("category_id")

        if not keyword or not category_id:
            return Response(
                {"detail": "keyword og category_id eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            rule = CategoryRule.objects.select_related("association").get(id=rule_id, deleted=False)
        except CategoryRule.DoesNotExist:
            return Response({"detail": "Regla fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_rule_access(request, rule)
        if err:
            return err

        try:
            category = Category.objects.get(id=int(category_id), deleted=False)
        except (Category.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        rule.keyword  = keyword
        rule.category = category
        rule.save()

        is_global = rule.association_id is None
        return Response({
            "id": rule.id, "keyword": rule.keyword,
            "category": {"id": category.id, "name": category.name}, "is_global": is_global,
        })

    def delete(self, request, rule_id):
        """DELETE /CategoryRule/delete/<rule_id> — soft-delete."""
        try:
            rule = CategoryRule.objects.select_related("association").get(id=rule_id, deleted=False)
        except CategoryRule.DoesNotExist:
            return Response({"detail": "Regla fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        err = self._check_rule_access(request, rule)
        if err:
            return err

        rule.deleted = True
        rule.save()
        return Response({"deleted": True})


class CategoryView(APIView):
    def _require_superadmin(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar geta breytt flokkum."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request, user_id):
        """GET /Category/{user_id} — all global categories (active + deleted) for the superadmin panel.
        Intentionally unguarded: category names are non-sensitive and this endpoint is only used
        by the superadmin UI which is already restricted client-side.
        """
        categories = Category.objects.all().order_by("name")
        return Response(CategorySerializer(categories, many=True).data)

    def post(self, request):
        """POST /Category — create a global category. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        name = request.data.get("name", "").strip()
        type_ = request.data.get("type", "")

        if not name or not type_:
            return Response({"detail": "name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        if type_ not in CategoryType.values:
            return Response({"detail": "Ógildur flokkategund."}, status=status.HTTP_400_BAD_REQUEST)

        category = Category.objects.create(name=name, type=type_)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)

    def put(self, request, category_id):
        """PUT /Category/update/{id} — update name/type/account FKs. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        try:
            category = Category.objects.get(id=category_id)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        category.name = request.data.get("name", category.name).strip()
        category.type = request.data.get("type", category.type)
        if not category.name or not category.type:
            return Response({"detail": "name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        if category.type not in CategoryType.values:
            return Response({"detail": "Ógildur flokkategund."}, status=status.HTTP_400_BAD_REQUEST)

        # Handle expense_account_id FK
        if "expense_account_id" in request.data:
            expense_account_id = request.data.get("expense_account_id")
            if expense_account_id is None:
                category.expense_account = None
            else:
                try:
                    category.expense_account = AccountingKey.objects.get(id=expense_account_id, deleted=False)
                except AccountingKey.DoesNotExist:
                    return Response({"detail": "Bókhaldslykill fyrir gjöld fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        # Handle income_account_id FK
        if "income_account_id" in request.data:
            income_account_id = request.data.get("income_account_id")
            if income_account_id is None:
                category.income_account = None
            else:
                try:
                    category.income_account = AccountingKey.objects.get(id=income_account_id, deleted=False)
                except AccountingKey.DoesNotExist:
                    return Response({"detail": "Bókhaldslykill fyrir tekjur fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        category.save(update_fields=["name", "type", "expense_account", "income_account"])
        return Response(CategorySerializer(category).data)

    def delete(self, request, category_id):
        """DELETE /Category/delete/{id} — soft-delete. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        try:
            category = Category.objects.get(id=category_id, deleted=False)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        category.deleted = True
        category.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, category_id):
        """PATCH /Category/enable/{id} — re-enable. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        try:
            category = Category.objects.get(id=category_id, deleted=True)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        category.deleted = False
        category.save(update_fields=["deleted"])
        return Response(CategorySerializer(category).data)


def _budget_with_items(budget):
    return Budget.objects.prefetch_related("items__category").get(id=budget.id)


class BudgetView(APIView):
    def _get_association(self, user_id, request):
        return _resolve_assoc(user_id, request)

    def get(self, request, user_id):
        """GET /Budget/{user_id} — Return the active budget for the current year, or null if none."""
        association = self._get_association(user_id, request)
        if not association:
            return Response({"detail": "Húsfélag fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        year = datetime.date.today().year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).prefetch_related("items__category").first()

        if not budget:
            return Response({"detail": "Engin áætlun fyrir þetta ár."}, status=status.HTTP_404_NOT_FOUND)

        return Response(BudgetSerializer(budget).data)


class BudgetItemView(APIView):
    def put(self, request, item_id):
        """PUT /BudgetItem/update/{id} — Update the amount of a budget item."""
        try:
            item = BudgetItem.objects.select_related("budget__association").get(id=item_id)
        except BudgetItem.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, item.budget.association)
        if err:
            return err

        amount = _parse_share(request.data.get("amount", item.amount))
        if amount is None or amount < 0:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)

        item.amount = amount
        item.save(update_fields=["amount"])
        item.refresh_from_db()
        return Response(BudgetItemSerializer(item).data)


class BudgetWizardView(APIView):
    def post(self, request):
        """
        POST /Budget/wizard — Create a new budget version with submitted amounts atomically.
        Body: {user_id, items: [{category_id, amount}, ...]}
        Supports ?as=<id> for superadmin.
        """
        user_id = request.data.get("user_id")
        items_data = request.data.get("items", [])

        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response({"detail": "user_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        if not items_data:
            return Response({"detail": "items cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        # Validate all category_ids exist in global active categories
        category_ids = [item.get("category_id") for item in items_data]
        active_ids = set(
            Category.objects.filter(deleted=False, id__in=category_ids).values_list("id", flat=True)
        )
        invalid = [cid for cid in category_ids if cid not in active_ids]
        if invalid:
            return Response(
                {"detail": f"Ógilt category_id: {invalid}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate amounts
        for item in items_data:
            raw_amount = item.get("amount")
            if raw_amount is None:
                return Response({"detail": "Each item must have an amount."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                from decimal import Decimal, InvalidOperation
                amt = Decimal(str(raw_amount))
            except (InvalidOperation, TypeError, ValueError):
                return Response({"detail": "amount must be a number."}, status=status.HTTP_400_BAD_REQUEST)
            if amt < 0:
                return Response({"detail": "amount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)

        year = datetime.date.today().year

        with transaction.atomic():
            last_budget = Budget.objects.filter(
                association=association, year=year
            ).order_by("-version").first()
            next_version = (last_budget.version + 1) if last_budget else 1

            Budget.objects.filter(association=association, year=year).update(is_active=False)

            new_budget = Budget.objects.create(
                association=association, year=year, version=next_version, is_active=True
            )
            BudgetItem.objects.bulk_create([
                BudgetItem(
                    budget=new_budget,
                    category_id=item["category_id"],
                    amount=item.get("amount", 0),
                )
                for item in items_data
            ])

        new_budget_with_items = Budget.objects.prefetch_related("items__category").get(id=new_budget.id)
        return Response(
            BudgetSerializer(new_budget_with_items).data,
            status=status.HTTP_201_CREATED,
        )


class CollectionView(APIView):
    def get(self, request, user_id):
        """GET /Collection/{user_id}

        ?month=M&year=Y  — stored Collection records + unmatched income transactions
        ?summary=1       — computed-on-the-fly annual/monthly per apartment (legacy)
        (no params)      — same as ?summary=1
        """
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        month_param = request.query_params.get("month")
        year_param = request.query_params.get("year")

        if month_param and year_param:
            try:
                month = int(month_param)
                year = int(year_param)
            except (ValueError, TypeError):
                return Response({"detail": "month og year verða að vera tölur."}, status=status.HTTP_400_BAD_REQUEST)
            if not (1 <= month <= 12):
                return Response({"detail": "month verður að vera á bilinu 1–12."}, status=status.HTTP_400_BAD_REQUEST)
            return self._month_mode(association, month, year)
        return self._summary_mode(association)

    def _month_mode(self, association, month, year):
        """Return stored Collection records for the given month + unmatched income transactions."""
        collections = (
            Collection.objects
            .filter(budget__association=association, budget__year=year, budget__is_active=True, month=month)
            .select_related("apartment", "payer", "paid_transaction", "bank_claim")
            .order_by("apartment__anr")
        )

        rows = []
        for col in collections:
            try:
                claim_status = col.bank_claim.status
                claim_id = col.bank_claim.claim_id
            except Collection.bank_claim.RelatedObjectDoesNotExist:
                claim_status = None
                claim_id = None
            rows.append({
                "collection_id": col.id,
                "apartment_id": col.apartment_id,
                "anr": col.apartment.anr,
                "payer_name": col.payer.name if col.payer else None,
                "payer_kennitala": col.payer.kennitala if col.payer else None,
                "amount_total": str(col.amount_total),
                "status": col.status,
                "paid_transaction_id": col.paid_transaction_id,
                "paid_transaction_date": str(col.paid_transaction.date) if col.paid_transaction else None,
                "claim_status": claim_status,
                "claim_id": claim_id,
            })

        # Unmatched: positive income transactions in this month, not RECONCILED, not linked to any collection
        unmatched_qs = Transaction.objects.filter(
            bank_account__association=association,
            date__year=year,
            date__month=month,
            amount__gt=0,
        ).exclude(status=TransactionStatus.RECONCILED).filter(collection_payment__isnull=True)

        unmatched = [
            {
                "transaction_id": tx.id,
                "date": str(tx.date),
                "description": tx.description,
                "amount": str(tx.amount),
                "payer_kennitala": tx.payer_kennitala,
            }
            for tx in unmatched_qs.order_by("date")
        ]

        bank_settings_configured = AssociationBankSettings.objects.filter(association=association).exists()
        return Response({"month": month, "year": year, "rows": rows, "unmatched": unmatched, "bank_settings_configured": bank_settings_configured})

    def _summary_mode(self, association):
        """Computed-on-the-fly annual/monthly amounts per apartment (legacy behaviour)."""
        year = datetime.date.today().year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).prefetch_related("items__category").first()

        if not budget:
            return Response([], status=status.HTTP_200_OK)

        totals = {"SHARED": Decimal("0"), "SHARE2": Decimal("0"), "SHARE3": Decimal("0"), "EQUAL": Decimal("0")}
        for item in budget.items.all():
            if item.category and item.category.type in totals:
                totals[item.category.type] += item.amount

        apartments = association.apartments.filter(deleted=False).prefetch_related(
            "ownerships__user"
        ).order_by("anr")

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

        budget_summary = [
            {"type": t, "budget": totals[t], "share_sum": share_sums[t]}
            for t in ("SHARED", "SHARE2", "SHARE3", "EQUAL")
            if totals[t] > 0
        ]

        pending_total = Collection.objects.filter(
            budget__association=association, status=CollectionStatus.PENDING,
        ).aggregate(total=django_models.Sum("amount_total"))["total"] or Decimal("0")

        return Response({"rows": rows, "budget_summary": budget_summary, "pending_total": str(pending_total)})


class CollectionGenerateView(APIView):
    def post(self, request):
        """POST /Collection/generate — generate collection items for a given month/year."""
        user_id = request.data.get("user_id")
        month = request.data.get("month")
        year = request.data.get("year")

        if not user_id or not month or not year:
            return Response({"detail": "user_id, month og year eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            month = int(month)
            year = int(year)
        except (ValueError, TypeError):
            return Response({"detail": "month og year verða að vera tölur."}, status=status.HTTP_400_BAD_REQUEST)
        if not (1 <= month <= 12):
            return Response({"detail": "month verður að vera á bilinu 1–12."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        budget = Budget.objects.filter(association=association, year=year, is_active=True).first()
        if not budget:
            return Response({"detail": "Engin virk áætlun fannst fyrir þetta ár."}, status=status.HTTP_404_NOT_FOUND)

        # Sum budget amounts by category type, divided by 12 for a single month
        totals = {"SHARED": Decimal("0"), "SHARE2": Decimal("0"), "SHARE3": Decimal("0"), "EQUAL": Decimal("0")}
        for item in budget.items.select_related("category").all():
            if item.category and item.category.type in totals:
                totals[item.category.type] += item.amount
        totals = {k: (v / 12).quantize(Decimal("0.01")) for k, v in totals.items()}

        apartments = association.apartments.filter(deleted=False).prefetch_related(
            "ownerships__user"
        ).order_by("anr")

        # Validate share totals — only check types that have a non-zero budget amount
        TYPE_SHARE_FIELD = {
            "SHARED": ("share",    "Sameiginlegt"),
            "SHARE2": ("share_2",  "Hiti"),
            "SHARE3": ("share_3",  "Lóð"),
            "EQUAL":  ("share_eq", "Jafnskipt"),
        }
        agg = apartments.aggregate(
            s=django_models.Sum("share"),
            s2=django_models.Sum("share_2"),
            s3=django_models.Sum("share_3"),
            seq=django_models.Sum("share_eq"),
        )
        share_sums = {
            "SHARED": agg["s"]   or Decimal("0"),
            "SHARE2": agg["s2"]  or Decimal("0"),
            "SHARE3": agg["s3"]  or Decimal("0"),
            "EQUAL":  agg["seq"] or Decimal("0"),
        }
        errors = []
        for type_key, (_, label) in TYPE_SHARE_FIELD.items():
            if totals[type_key] > 0:
                total_share = share_sums[type_key].quantize(Decimal("0.01"))
                if abs(total_share - Decimal("100")) > Decimal("0.5"):
                    errors.append(
                        f"{label}: hlutfallssamtala er {total_share}% (ætti að vera 100%)"
                    )
        if errors:
            return Response(
                {"detail": "Hlutföll íbúða eru ekki rétt stillt — leiðrétta þarf áður en innheimta er búin til.",
                 "errors": errors},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        created = 0
        skipped = 0
        for apt in apartments:
            payer_ownership = apt.ownerships.filter(is_payer=True, deleted=False).select_related("user").first()
            payer = payer_ownership.user if payer_ownership else None

            shared_amt = (totals["SHARED"] * apt.share    / Decimal("100")).quantize(Decimal("1"))
            share2_amt = (totals["SHARE2"] * apt.share_2  / Decimal("100")).quantize(Decimal("1"))
            share3_amt = (totals["SHARE3"] * apt.share_3  / Decimal("100")).quantize(Decimal("1"))
            equal_amt  = (totals["EQUAL"]  * apt.share_eq / Decimal("100")).quantize(Decimal("1"))
            amount_shared = shared_amt + share2_amt + share3_amt
            amount_total  = amount_shared + equal_amt

            _, was_created = Collection.objects.get_or_create(
                budget=budget,
                apartment=apt,
                month=month,
                defaults={
                    "payer": payer,
                    "amount_shared": amount_shared,
                    "amount_equal": equal_amt,
                    "amount_total": amount_total,
                    "status": CollectionStatus.PENDING,
                },
            )
            if was_created:
                created += 1
            else:
                skipped += 1

        return Response({"created": created, "skipped": skipped}, status=status.HTTP_201_CREATED)


class CollectionMatchView(APIView):
    def post(self, request):
        """POST /Collection/match — manually link a transaction to a collection item."""
        user_id = request.data.get("user_id")
        collection_id = request.data.get("collection_id")
        transaction_id = request.data.get("transaction_id")

        if not user_id or not collection_id or not transaction_id:
            return Response({"detail": "user_id, collection_id og transaction_id eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            col = Collection.objects.get(id=collection_id, budget__association=association)
        except Collection.DoesNotExist:
            return Response({"detail": "Innheimtufærsla ekki fundin."}, status=status.HTTP_403_FORBIDDEN)

        try:
            tx = Transaction.objects.get(id=transaction_id, bank_account__association=association)
        except Transaction.DoesNotExist:
            return Response({"detail": "Færsla ekki fundin."}, status=status.HTTP_403_FORBIDDEN)

        hussjoður_cat = Category.objects.filter(type=CategoryType.INCOME, name="Hússjóður", deleted=False).first()
        with transaction.atomic():
            col = Collection.objects.select_for_update().get(id=collection_id, budget__association=association)
            tx = Transaction.objects.select_for_update().get(id=transaction_id, bank_account__association=association)
            if col.status == CollectionStatus.PAID:
                return Response({"detail": "Þessi innheimtufærsla er þegar greidd."}, status=status.HTTP_400_BAD_REQUEST)
            if tx.amount <= 0:
                return Response({"detail": "Færslan er ekki jákvæð."}, status=status.HTTP_400_BAD_REQUEST)
            col.paid_transaction = tx
            col.status = CollectionStatus.PAID
            tx.status = TransactionStatus.RECONCILED
            if hussjoður_cat:
                tx.category = hussjoður_cat
            col.save(update_fields=["paid_transaction", "status"])
            tx.save(update_fields=["status", "category"])

        return Response({
            "collection_id": col.id,
            "status": col.status,
            "paid_transaction_id": tx.id,
        })


class CollectionUnmatchView(APIView):
    def post(self, request):
        """POST /Collection/unmatch — remove the link between a collection item and its transaction."""
        user_id = request.data.get("user_id")
        collection_id = request.data.get("collection_id")

        if not user_id or not collection_id:
            return Response({"detail": "user_id og collection_id eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            col = Collection.objects.get(id=collection_id, budget__association=association)
        except Collection.DoesNotExist:
            return Response({"detail": "Innheimtufærsla ekki fundin."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            col = Collection.objects.select_for_update().get(id=collection_id, budget__association=association)
            if col.status != CollectionStatus.PAID:
                return Response({"detail": "Þessi innheimtufærsla er ekki greidd."}, status=status.HTTP_400_BAD_REQUEST)
            tx = col.paid_transaction
            col.paid_transaction = None
            col.status = CollectionStatus.PENDING
            col.save(update_fields=["paid_transaction", "status"])
            if tx:
                tx = Transaction.objects.select_for_update().get(id=tx.id)
                tx.status = TransactionStatus.IMPORTED
                tx.category = None
                tx.save(update_fields=["status", "category"])

        return Response({"collection_id": col.id, "status": col.status})


class CollectionCandidatesView(APIView):
    def get(self, request, collection_id):
        """GET /Collection/candidates/<collection_id>
        Returns positive unreconciled transactions for the payer of this collection item,
        across all months/years. Excludes transactions already linked to another collection.
        Query params: user_id (required), ?as= (superadmin impersonation).
        """
        user_id = request.query_params.get("user_id")
        if not user_id:
            return Response({"detail": "user_id er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            col = Collection.objects.select_related("payer").get(
                id=collection_id, budget__association=association
            )
        except Collection.DoesNotExist:
            return Response({"detail": "Innheimtufærsla ekki fundin."}, status=status.HTTP_404_NOT_FOUND)

        if not col.payer:
            return Response({"detail": "Innheimtufærslan hefur engan greiðanda."}, status=status.HTTP_400_BAD_REQUEST)

        txs = (
            Transaction.objects
            .filter(
                bank_account__association=association,
                payer_kennitala=col.payer.kennitala,
                amount__gt=0,
            )
            .exclude(status=TransactionStatus.RECONCILED)
            .exclude(collection_payment__isnull=False)
            .select_related("bank_account")
            .order_by("-date")
        )

        return Response([
            {
                "transaction_id": tx.id,
                "date": str(tx.date),
                "description": tx.description,
                "amount": str(tx.amount),
                "bank_account_name": tx.bank_account.name,
            }
            for tx in txs
        ])


class AssociationListView(APIView):
    def get(self, request, user_id):
        """GET /Association/list/{user_id}[?q=search] — List associations for the user.
        Superadmin gets all; regular users get only their own.
        Optional ?q= filters by name or SSN (case-insensitive substring)."""
        # Validate URL user_id matches the authenticated user (unless superadmin)
        if not request.user.is_superadmin and request.user.id != user_id:
            return Response([], status=status.HTTP_200_OK)

        user = request.user
        q = request.query_params.get("q", "").strip()
        is_superadmin = user.is_superadmin

        # Always start with the user's own associations
        own_qs = list(Association.objects.filter(
            access_entries__user_id=user.id, access_entries__active=True
        ).order_by("name"))

        if q and is_superadmin:
            # Superadmin search: all associations, own first, then others
            own_ids = {a.id for a in own_qs}
            all_qs = list(Association.objects.all().order_by("name"))
            matched = [a for a in all_qs if _matches(a.name, q) or q.replace('-', '') in a.ssn]
            own_matched = [a for a in matched if a.id in own_ids]
            other_matched = [a for a in matched if a.id not in own_ids]
            qs = own_matched + other_matched
        elif q:
            qs = [a for a in own_qs if _matches(a.name, q) or q.replace('-', '') in a.ssn]
        else:
            qs = own_qs

        ctx = {"user_id": user.id, "is_superadmin": is_superadmin}
        return Response(AssociationAccessSerializer(qs, many=True, context=ctx).data)


class AdminAssociationView(APIView):
    def _require_superadmin(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request):
        """GET /admin/Association?q=search — Search all associations. Superadmin only."""
        err = self._require_superadmin(request)
        if err:
            return err

        q = request.query_params.get("q", "").strip()
        qs = list(Association.objects.all().order_by("name"))
        if q:
            qs = [a for a in qs if _matches(a.name, q) or q.replace('-', '') in a.ssn]
        return Response(AssociationAccessSerializer(qs[:50], many=True, context={"user_id": None}).data)

    def post(self, request):
        """
        POST /admin/Association — Create an association and assign a chair. Superadmin only.
        Body: { association_ssn, chair_ssn }
        Fetches association info from the Skattur Cloud company registry API.
        """
        err = self._require_superadmin(request)
        if err:
            return err

        association_ssn = str(request.data.get("association_ssn", "")).strip().replace("-", "")
        chair_ssn = str(request.data.get("chair_ssn", "")).strip().replace("-", "")

        if not association_ssn.isdigit() or len(association_ssn) != 10:
            return Response({"detail": "association_ssn verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)
        if not chair_ssn.isdigit() or len(chair_ssn) != 10:
            return Response({"detail": "chair_ssn verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)

        if Association.objects.filter(ssn=association_ssn).exists():
            return Response({"detail": "Þetta húsfélag er þegar skráð í kerfið."}, status=status.HTTP_409_CONFLICT)

        entity = fetch_legal_entity(association_ssn)
        if entity is None:
            return Response(
                {"detail": "Ekki tókst að ná sambandi við Skattur Cloud. Reyndu aftur síðar."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        fields = parse_entity_for_association(association_ssn, entity)

        chair_user, _ = User.objects.get_or_create(
            kennitala=chair_ssn,
            defaults={"name": chair_ssn},  # placeholder until Þjóðskrá lookup
        )

        try:
            with transaction.atomic():
                association = Association.objects.create(
                    ssn=fields["ssn"],
                    name=fields["name"],
                    address=fields["address"],
                    postal_code=fields["postal_code"],
                    city=fields["city"],
                    date_of_board_change=fields["date_of_board_change"],
                    registered=fields["registered"],
                    status=fields["status"],
                )
                AssociationAccess.objects.create(
                    user=chair_user,
                    association=association,
                    role=AssociationRole.CHAIR,
                    active=True,
                )
        except Exception:
            if Association.objects.filter(ssn=association_ssn).exists():
                return Response({"detail": "Þetta húsfélag er þegar skráð í kerfið."}, status=status.HTTP_409_CONFLICT)
            raise

        return Response(AssociationAccessSerializer(association, context={"user_id": None}).data, status=status.HTTP_201_CREATED)


class AdminStatsView(APIView):
    def get(self, request):
        """GET /admin/stats?days=N — System-wide KPIs. Superadmin only.
        days: window for active users (default 365). 0 = all registered users."""
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        try:
            days = int(request.query_params.get("days", 365))
        except ValueError:
            days = 365

        if days > 0:
            cutoff = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=days)
            active_users = User.objects.filter(last_login__gte=cutoff).count()
        else:
            active_users = User.objects.count()

        return Response({
            "active_associations": Association.objects.count(),
            "active_apartments": Apartment.objects.filter(deleted=False).count(),
            "active_owners": ApartmentOwnership.objects.filter(deleted=False).values("user").distinct().count(),
            "active_users": active_users,
            "days": days,
        })


HMS_URL_RE = re.compile(r'^https://hms\.is/fasteignaskra/\d+/\d+$')


class ApartmentImportSourcesView(APIView):
    def get(self, request):
        """GET /Apartment/import/sources?user_id=N — Return saved HMS URLs for the association."""
        user_id = request.query_params.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        association = _resolve_assoc(int(user_id), request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err
        sources = association.hms_sources.order_by("stadfang_id").values(
            "url", "landeign_id", "stadfang_id", "last_imported_at"
        )
        return Response(list(sources))


class ApartmentImportPreviewView(APIView):
    def post(self, request):
        """POST /Apartment/import/preview — Scrape URLs and return create/update/missing classification."""
        user_id = request.data.get("user_id")
        urls = request.data.get("urls", [])

        if not user_id or not urls:
            return Response({"detail": "user_id and urls are required."}, status=status.HTTP_400_BAD_REQUEST)

        for url in urls:
            if not HMS_URL_RE.match(url):
                return Response(
                    {"detail": f"Ógild HMS slóð: {url}. Dæmi: https://hms.is/fasteignaskra/228369/1203373"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        association = _resolve_assoc(int(user_id), request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        # Scrape and merge all URLs, deduplicate by fnr
        scraped_by_fnr = {}
        for url in urls:
            result = scrape_hms_apartments(url)
            if result is None:
                return Response(
                    {"detail": "Ekki tókst að ná sambandi við HMS. Reyndu aftur síðar."},
                    status=status.HTTP_502_BAD_GATEWAY
                )
            for apt in result:
                scraped_by_fnr[apt["fnr"]] = apt

        # Compare against existing DB apartments for this association
        existing = {
            apt.fnr: apt
            for apt in association.apartments.filter(deleted=False)
        }

        create_list = []
        update_list = []
        scraped_fnrs = set(scraped_by_fnr.keys())

        for fnr, scraped in scraped_by_fnr.items():
            if fnr in existing:
                db_apt = existing[fnr]
                update_list.append({
                    "id": db_apt.id,
                    "fnr": fnr,
                    "anr": scraped["anr"],
                    "size": scraped["size"],
                    "current_anr": db_apt.anr,
                    "current_size": float(db_apt.size),
                })
            else:
                create_list.append({"fnr": fnr, "anr": scraped["anr"], "size": scraped["size"]})

        missing_list = [
            {"id": apt.id, "fnr": apt.fnr, "anr": apt.anr}
            for fnr, apt in existing.items()
            if fnr not in scraped_fnrs
        ]

        return Response({"create": create_list, "update": update_list, "missing": missing_list})


class ApartmentImportConfirmView(APIView):
    def post(self, request):
        """POST /Apartment/import/confirm — Apply the import: create, update, deactivate, save sources."""
        user_id = request.data.get("user_id")
        urls = request.data.get("urls", [])
        deactivate_ids = request.data.get("deactivate_ids", [])

        if not user_id or not urls:
            return Response({"detail": "user_id and urls are required."}, status=status.HTTP_400_BAD_REQUEST)

        for url in urls:
            if not HMS_URL_RE.match(url):
                return Response(
                    {"detail": f"Ógild HMS slóð: {url}."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if not isinstance(deactivate_ids, list) or not all(isinstance(i, int) for i in deactivate_ids):
            return Response({"detail": "deactivate_ids must be a list of integers."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(int(user_id), request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        # Re-scrape (don't trust client preview)
        scraped_by_fnr = {}
        for url in urls:
            result = scrape_hms_apartments(url)
            if result is None:
                return Response(
                    {"detail": "Ekki tókst að ná sambandi við HMS. Reyndu aftur síðar."},
                    status=status.HTTP_502_BAD_GATEWAY
                )
            for apt in result:
                scraped_by_fnr[apt["fnr"]] = apt

        existing = {apt.fnr: apt for apt in association.apartments.filter(deleted=False)}

        with transaction.atomic():
            # Create new apartments
            to_create = [
                Apartment(association=association, fnr=fnr, anr=data["anr"], size=data["size"])
                for fnr, data in scraped_by_fnr.items()
                if fnr not in existing
            ]
            Apartment.objects.bulk_create(to_create)

            # Update existing apartments
            for fnr, data in scraped_by_fnr.items():
                if fnr in existing:
                    apt = existing[fnr]
                    apt.anr = data["anr"]
                    apt.size = data["size"]
                    apt.save(update_fields=["anr", "size"])

            # Soft-delete requested apartments
            if deactivate_ids:
                Apartment.objects.filter(
                    id__in=deactivate_ids, association=association
                ).update(deleted=True)

            # Upsert HMS sources — parse landeign_id and stadfang_id from URL
            for url in urls:
                parts = url.rstrip("/").split("/")
                landeign_id = int(parts[-2])
                stadfang_id = int(parts[-1])
                HMSImportSource.objects.update_or_create(
                    association=association,
                    stadfang_id=stadfang_id,
                    defaults={"url": url, "landeign_id": landeign_id},
                )

        # Recalculate equal share for all active apartments
        _recalc_share_eq(association)

        # Return updated apartment list
        apartments = association.apartments.filter(deleted=False)
        return Response(ApartmentSerializer(apartments, many=True).data)


class ReportView(APIView):
    def get(self, request, user_id):
        """
        GET /Report/<user_id>?year=YYYY
        GET /Report/<user_id>?year=YYYY&month=M
        Full-year or single-month financial report for the association.
        Positive amounts = income; negative amounts = expenses (shown as absolute values).
        """
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        year_param = request.query_params.get("year")
        year = int(year_param) if year_param and year_param.isdigit() else datetime.date.today().year

        month_param = request.query_params.get("month")
        month = int(month_param) if month_param and month_param.isdigit() else None
        if month is not None and not (1 <= month <= 12):
            return Response({"detail": "month must be 1-12."}, status=status.HTTP_400_BAD_REQUEST)

        # Base transaction queryset for this association and year
        txn_qs = Transaction.objects.filter(
            bank_account__association=association,
            date__year=year,
        )
        if month:
            txn_qs = txn_qs.filter(date__month=month)

        # --- Income ---
        income_rows = (
            txn_qs.filter(amount__gt=0, category__isnull=False)
            .values("category_id", "category__name")
            .annotate(actual=django_models.Sum("amount"))
            .order_by("category__name")
        )
        income = [
            {
                "category_id": r["category_id"],
                "category_name": r["category__name"],
                "actual": str(r["actual"]),
            }
            for r in income_rows
        ]

        income_uncategorised = (
            txn_qs.filter(amount__gt=0, category__isnull=True)
            .aggregate(total=django_models.Sum("amount"))["total"]
            or Decimal("0")
        )

        # --- Expenses ---
        expense_rows = (
            txn_qs.filter(amount__lt=0, category__isnull=False)
            .values("category_id", "category__name")
            .annotate(actual_neg=django_models.Sum("amount"))
            .order_by("category__name")
        )
        actual_by_cat = {r["category_id"]: abs(r["actual_neg"]) for r in expense_rows}
        cat_names = {r["category_id"]: r["category__name"] for r in expense_rows}

        # Budget items for the active budget of this year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).first()
        budgeted_by_cat = {}
        if budget:
            for item in BudgetItem.objects.filter(budget=budget).select_related("category"):
                budgeted_by_cat[item.category_id] = item.amount
                cat_names.setdefault(item.category_id, item.category.name)

        all_expense_cat_ids = set(actual_by_cat.keys()) | set(budgeted_by_cat.keys())
        expenses = sorted(
            [
                {
                    "category_id": cid,
                    "category_name": cat_names[cid],
                    "budgeted": str(budgeted_by_cat.get(cid, Decimal("0"))),
                    "actual": str(actual_by_cat.get(cid, Decimal("0"))),
                }
                for cid in all_expense_cat_ids
            ],
            key=lambda x: x["category_name"],
        )

        expenses_uncategorised = (
            txn_qs.filter(amount__lt=0, category__isnull=True)
            .aggregate(total=django_models.Sum("amount"))["total"]
            or Decimal("0")
        )

        # --- Monthly breakdown (full-year mode only) ---
        monthly = []
        if not month:
            from django.db.models import DecimalField as DField
            monthly_rows = {
                r["date__month"]: r
                for r in txn_qs.values("date__month").annotate(
                    income=django_models.Sum(
                        django_models.Case(
                            django_models.When(amount__gt=0, then="amount"),
                            default=0,
                            output_field=DField(max_digits=14, decimal_places=2),
                        )
                    ),
                    expenses=django_models.Sum(
                        django_models.Case(
                            django_models.When(amount__lt=0, then="amount"),
                            default=0,
                            output_field=DField(max_digits=14, decimal_places=2),
                        )
                    ),
                ).order_by("date__month")
            }
            for m in range(1, 13):
                row = monthly_rows.get(m, {})
                inc = row.get("income") or Decimal("0")
                exp = row.get("expenses") or Decimal("0")
                monthly.append({"month": m, "income": str(inc), "expenses": str(abs(exp))})

        return Response({
            "year": year,
            "income": income,
            "income_uncategorised": str(income_uncategorised),
            "expenses": expenses,
            "expenses_uncategorised": str(abs(expenses_uncategorised)),
            "monthly": monthly,
        })


def _build_annual_statement_data(association, year):
    """Return income/expense/asset data for a given year, grouped by accounting key."""
    end_of_year = datetime.date(year, 12, 31)

    txn_qs = Transaction.objects.filter(
        bank_account__association=association,
        date__year=year,
    ).select_related("category__income_account", "category__expense_account")

    income_by_key = {}   # (number, name) -> Decimal
    expense_by_key = {}  # (number, name) -> Decimal (positive)
    income_uncat = Decimal("0")
    expense_uncat = Decimal("0")

    for tx in txn_qs:
        amt = tx.amount
        cat = tx.category
        if amt > 0:
            if cat and cat.income_account:
                k = (cat.income_account.number, cat.income_account.name)
                income_by_key[k] = income_by_key.get(k, Decimal("0")) + amt
            else:
                income_uncat += amt
        else:
            if cat and cat.expense_account:
                k = (cat.expense_account.number, cat.expense_account.name)
                expense_by_key[k] = expense_by_key.get(k, Decimal("0")) + abs(amt)
            else:
                expense_uncat += abs(amt)

    income = sorted(
        [{"account_number": k[0], "account_name": k[1], "amount": str(v)} for k, v in income_by_key.items()],
        key=lambda x: x["account_number"],
    )
    expenses = sorted(
        [{"account_number": k[0], "account_name": k[1], "amount": str(v)} for k, v in expense_by_key.items()],
        key=lambda x: x["account_number"],
    )

    total_income = sum(income_by_key.values()) + income_uncat
    total_expenses = sum(expense_by_key.values()) + expense_uncat
    net = total_income - total_expenses

    # Bank account balances at year-end (all transactions up to Dec 31)
    bank_accounts = (
        association.bank_accounts.filter(deleted=False)
        .annotate(
            year_end_balance=django_models.Sum(
                "transactions__amount",
                filter=django_models.Q(transactions__date__lte=end_of_year),
            )
        )
        .select_related("asset_account")
    )
    assets = []
    total_assets = Decimal("0")
    for ba in bank_accounts:
        balance = ba.year_end_balance or Decimal("0")
        assets.append({
            "account_number": ba.asset_account.number if ba.asset_account else None,
            "account_name": ba.asset_account.name if ba.asset_account else "",
            "label": ba.name,
            "amount": str(balance),
        })
        total_assets += balance

    has_data = txn_qs.exists() or bool(assets)

    return {
        "has_data": has_data,
        "income": income,
        "income_uncategorised": str(income_uncat),
        "expenses": expenses,
        "expenses_uncategorised": str(expense_uncat),
        "total_income": str(total_income),
        "total_expenses": str(total_expenses),
        "net": str(net),
        "assets": assets,
        "total_assets": str(total_assets),
    }


class AnnualStatementView(APIView):
    def get(self, request, user_id):
        """
        GET /AnnualStatement/<user_id>?year=YYYY
        Returns full annual statement data grouped by accounting key,
        with previous-year comparison and association info.
        """
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        year_param = request.query_params.get("year")
        year = int(year_param) if year_param and year_param.isdigit() else datetime.date.today().year

        current_data = _build_annual_statement_data(association, year)
        prev_data = _build_annual_statement_data(association, year - 1)

        return Response({
            "association": {
                "name": association.name,
                "ssn": association.ssn,
                "address": association.address,
                "postal_code": association.postal_code,
                "city": association.city,
            },
            "year": year,
            **{k: v for k, v in current_data.items() if k != "has_data"},
            "previous_year": {k: v for k, v in prev_data.items() if k != "has_data"} if prev_data["has_data"] else None,
        })


class RegistrationRequestView(APIView):
    """POST /RegistrationRequest — any authenticated user may submit."""

    def post(self, request):
        data = request.data
        assoc_ssn = str(data.get("assoc_ssn", "")).replace("-", "")
        chair_ssn = str(data.get("chair_ssn", "")).replace("-", "")

        if len(assoc_ssn) != 10:
            return Response({"detail": "Kennitala húsfélags verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)
        if len(chair_ssn) != 10:
            return Response({"detail": "Kennitala formanns verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)
        for field in ("assoc_name", "chair_name", "chair_email", "chair_phone"):
            if not str(data.get(field, "")).strip():
                return Response({"detail": f"Reitur '{field}' vantar."}, status=status.HTTP_400_BAD_REQUEST)

        RegistrationRequest.objects.create(
            submitted_by=request.user,
            assoc_ssn=assoc_ssn,
            assoc_name=str(data["assoc_name"]).strip(),
            chair_ssn=chair_ssn,
            chair_name=str(data["chair_name"]).strip(),
            chair_email=str(data["chair_email"]).strip(),
            chair_phone=str(data["chair_phone"]).strip(),
        )
        return Response({"detail": "Beiðni móttekin."}, status=status.HTTP_201_CREATED)


class AdminRegistrationRequestView(APIView):
    """GET /admin/RegistrationRequest — list pending; PATCH /<id> — mark reviewed."""

    def get(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
        qs = RegistrationRequest.objects.filter(status=RegistrationRequestStatus.PENDING).select_related("submitted_by")
        result = [
            {
                "id": r.id,
                "assoc_ssn": r.assoc_ssn,
                "assoc_name": r.assoc_name,
                "chair_ssn": r.chair_ssn,
                "chair_name": r.chair_name,
                "chair_email": r.chair_email,
                "chair_phone": r.chair_phone,
                "submitted_by": r.submitted_by.name,
                "created_at": r.created_at.isoformat(),
            }
            for r in qs
        ]
        return Response(result)

    def patch(self, request, req_id):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
        try:
            reg_req = RegistrationRequest.objects.get(pk=req_id)
        except RegistrationRequest.DoesNotExist:
            return Response({"detail": "Beiðni finnst ekki."}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get("status")
        if new_status not in RegistrationRequestStatus.values:
            return Response({"detail": "Óþekkt staða."}, status=status.HTTP_400_BAD_REQUEST)
        reg_req.status = new_status
        reg_req.save(update_fields=["status"])
        return Response({"detail": "Staða uppfærð."})
