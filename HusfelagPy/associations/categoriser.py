import re
from .models import CategoryRule, Transaction, TransactionStatus


def normalise_vendor(description: str) -> str:
    """Extract a cleaned vendor name from a bank transaction description.
    Strips trailing reference numbers (6+ digits), dates (DD.MM.YY patterns),
    and trailing punctuation. Lowercases.
    Example: "HS Veitur hf. 280226" -> "hs veitur hf"
    """
    if not description:
        return ""
    s = description.strip()
    # Strip trailing 6+ digit sequences (reference numbers / dates like 280226)
    s = re.sub(r'\s+\d{6,}\s*$', '', s)
    # Strip trailing dates like 28.02.26 or 28/02/2026
    s = re.sub(r'\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*$', '', s)
    # Strip trailing punctuation
    s = re.sub(r'[\s.,;:]+$', '', s)
    return s.lower().strip()


def build_categorisation_context(association):
    """Load rules and history for a batch categorisation run.
    Returns:
      rules   — association rules first, then global rules (all non-deleted)
      history — {normalised_vendor: category} from association's categorised transactions
    Two DB queries total.
    """
    from django.db import models as django_models

    rules = list(
        CategoryRule.objects.filter(deleted=False)
        .filter(
            django_models.Q(association=association) | django_models.Q(association__isnull=True)
        )
        .select_related("category")
        .order_by(
            django_models.Case(
                django_models.When(association=association, then=0),
                default=1,
            ),
            "id",
        )
    )

    categorised_txns = (
        Transaction.objects.filter(
            bank_account__association=association,
            status=TransactionStatus.CATEGORISED,
            category__isnull=False,
        )
        .select_related("category")
        .order_by("-date", "-created_at")
    )

    history = {}
    for txn in categorised_txns:
        vendor = normalise_vendor(txn.description)
        if vendor and vendor not in history:
            history[vendor] = txn.category

    return rules, history


def categorise_row(description: str, rules: list, history: dict):
    """Return a Category for this description, or None if no match.
    1. Check rules in order: first rule where keyword.lower() in description.lower() wins.
    2. If no rule matches, look up normalise_vendor(description) in history.
    3. Return None if nothing matches.
    """
    desc_lower = description.lower()
    for rule in rules:
        if rule.keyword.lower() in desc_lower:
            return rule.category

    vendor = normalise_vendor(description)
    if vendor in history:
        return history[vendor]

    return None
