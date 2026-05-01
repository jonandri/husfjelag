"""
Inter-account transfer detection.

Runs before the text-based category classifier in the import pipeline. When a
matched pair of transactions is found across two bank accounts of the same
association, both legs are marked RECONCILED and an InterAccountTransfer record
is created. When only one leg is present (the other account hasn't been imported
yet), the transaction is parked as PENDING_TRANSFER and reconciled once the
counterpart arrives.

Detection criteria:
  A transaction is a candidate when EITHER:
  (a) transaction_type == "Millifært"  (bank explicitly labels it as a transfer), OR
  (b) transaction_type is empty AND reference == association.ssn
      (fallback for parsers that don't capture the type field).
  Then a match requires: same date, opposite sign, equal absolute amount,
  different bank account of the same association.

  Note: Arion maps `reference` to Seðilnúmer (a bank note number, never a
  kennitala), so for Arion transactions only criterion (a) applies.
"""

from collections import defaultdict
from .models import InterAccountTransfer, TransactionStatus

TRANSFER_TYPE = "Millifært"


def _normalise_ssn(val: str) -> str:
    return (val or "").replace("-", "").replace(" ", "")


def _is_transfer_candidate(txn, assoc_ssn: str) -> bool:
    """Return True when txn could be a leg of an inter-account transfer."""
    txn_type = (txn.transaction_type or "").strip()
    if txn_type:
        if txn_type != TRANSFER_TYPE:
            return False
        # "Millifært" — require the association to be identifiable as counterparty.
        # Landsbankinn/Íslandsbanki: assoc SSN in Tilvísun (→ reference field).
        # Arion: assoc SSN in Kennitala viðtakanda eða greiðanda (→ payer_kennitala).
        payer_kt = _normalise_ssn(getattr(txn, "payer_kennitala", "") or "")
        return _normalise_ssn(txn.reference) == assoc_ssn or payer_kt == assoc_ssn
    # transaction_type not captured by the parser — fall back to reference or payer_kennitala.
    payer_kt = _normalise_ssn(getattr(txn, "payer_kennitala", "") or "")
    return _normalise_ssn(txn.reference) == assoc_ssn or payer_kt == assoc_ssn


def detect_transfers(new_transactions, association):
    """Detect inter-account transfer pairs among *new_transactions* (and any
    existing PENDING_TRANSFER rows in the DB) and reconcile matched pairs.

    Mutates the .status (and .category) attributes of Transaction objects in
    the list in-place so that the caller can immediately filter without a DB
    round-trip.

    Returns a list of InterAccountTransfer instances created.
    """
    assoc_ssn = _normalise_ssn(association.ssn)
    candidates = [t for t in new_transactions if _is_transfer_candidate(t, assoc_ssn)]

    if not candidates:
        return []

    # Build a lookup: (date, abs_amount) → [candidates] for O(n) batch matching.
    by_key = defaultdict(list)
    for txn in candidates:
        by_key[(txn.date, abs(txn.amount))].append(txn)

    processed_pks = set()
    created_transfers = []

    for txn in candidates:
        if txn.pk in processed_pks:
            continue

        key = (txn.date, abs(txn.amount))

        # --- Try to match within the current import batch first ---
        match = None
        for other in by_key[key]:
            if other.pk == txn.pk or other.pk in processed_pks:
                continue
            if other.bank_account_id == txn.bank_account_id:
                continue
            if other.amount == -txn.amount:
                match = other
                break

        if match:
            transfer = _reconcile_pair(txn, match, association)
            created_transfers.append(transfer)
            processed_pks.add(txn.pk)
            processed_pks.add(match.pk)
            continue

        # --- Try to match against an existing PENDING_TRANSFER in the DB ---
        db_match = _find_pending_match(txn, association, assoc_ssn)
        if db_match:
            transfer = _reconcile_pair(txn, db_match, association)
            created_transfers.append(transfer)
            processed_pks.add(txn.pk)
        else:
            # Park as pending — will be reconciled when the counterpart arrives.
            txn.status = TransactionStatus.PENDING_TRANSFER
            txn.save(update_fields=["status"])
            processed_pks.add(txn.pk)

    return created_transfers


def _find_pending_match(txn, association, assoc_ssn: str):
    """Look for an existing PENDING_TRANSFER row that is the opposite leg."""
    from .models import Transaction
    candidate = (
        Transaction.objects
        .filter(
            bank_account__association=association,
            status=TransactionStatus.PENDING_TRANSFER,
            date=txn.date,
            amount=-txn.amount,
        )
        .exclude(bank_account=txn.bank_account)
        .first()
    )
    if candidate and _is_transfer_candidate(candidate, assoc_ssn):
        return candidate
    return None


def _reconcile_pair(txn_a, txn_b, association):
    """Create an InterAccountTransfer and mark both legs RECONCILED."""
    # inbound = positive amount (money arriving at that account)
    if txn_a.amount > 0:
        inbound, outbound = txn_a, txn_b
    else:
        inbound, outbound = txn_b, txn_a

    transfer, _ = InterAccountTransfer.objects.get_or_create(
        inbound_transaction=inbound,
        outbound_transaction=outbound,
        defaults={
            "association": association,
            "date": inbound.date,
            "amount": abs(inbound.amount),
        },
    )

    for txn in (txn_a, txn_b):
        txn.status = TransactionStatus.TRANSFER
        txn.category = None
        txn.save(update_fields=["status", "category"])

    return transfer
