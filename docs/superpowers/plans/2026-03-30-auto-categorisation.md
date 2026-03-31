# Auto-Categorisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-assign categories to imported transactions using keyword rules and transaction history, with a management UI for association-level and global rules.

**Architecture:** A standalone `categoriser.py` module (mirroring `importers.py`) holds all matching logic. The `ImportConfirmView` calls it before `bulk_create`. A new `CategoryRule` model stores keyword→category mappings scoped to an association or global (null). A new `CategorisationRulesPage.js` exposes CRUD for these rules.

**Tech Stack:** Django 4.1, DRF 3.14, React 17, MUI v5. GPG bypass required for all commits: `git -c gpg.format=openpgp -c commit.gpgsign=false commit`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `HusfelagPy/associations/models.py` | Modify | Add `CategoryRule` model |
| `HusfelagPy/associations/migrations/0017_categoryrule.py` | Create | DB migration for `CategoryRule` |
| `HusfelagPy/associations/categoriser.py` | Create | `normalise_vendor`, `build_categorisation_context`, `categorise_row` |
| `HusfelagPy/associations/views.py` | Modify | Add `CategoryRuleView`; update `ImportConfirmView` to call categoriser |
| `HusfelagPy/associations/urls.py` | Modify | Register `CategoryRule` URL patterns |
| `HusfelagPy/associations/tests.py` | Modify | Add `CategoriserTest`, `CategoryRuleViewTest`, `ImportConfirmCategorisationTest` |
| `HusfelagJS/src/controlers/CategorisationRulesPage.js` | Create | Rules management page |
| `HusfelagJS/src/controlers/Sidebar.js` | Modify | Add "Flokkunarreglur" nav entry |
| `HusfelagJS/src/App.js` | Modify | Add `/flokkunarreglur` route |

---

## Task 1: CategoryRule model + migration

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: `HusfelagPy/associations/migrations/0017_categoryrule.py`

- [ ] **Step 1: Write the failing test**

In `HusfelagPy/associations/tests.py`, add at the end of the file:

```python
class CategoryRuleModelTest(TestCase):
    def setUp(self):
        self.association = Association.objects.create(
            ssn="1234567890", name="Test Félag",
            address="Testgata 1", postal_code="101", city="Reykjavík"
        )
        self.category = Category.objects.create(name="Hitaveita", type="SHARED")

    def test_association_rule_created(self):
        from .models import CategoryRule
        rule = CategoryRule.objects.create(
            keyword="HS Veitur",
            category=self.category,
            association=self.association,
        )
        self.assertEqual(rule.keyword, "HS Veitur")
        self.assertFalse(rule.deleted)
        self.assertEqual(rule.association, self.association)

    def test_global_rule_has_null_association(self):
        from .models import CategoryRule
        rule = CategoryRule.objects.create(
            keyword="Orka",
            category=self.category,
            association=None,
        )
        self.assertIsNone(rule.association)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryRuleModelTest -v 2
```

Expected: FAIL — `ImportError: cannot import name 'CategoryRule'`

- [ ] **Step 3: Add CategoryRule to models.py**

In `HusfelagPy/associations/models.py`, append after the `HMSImportSource` class:

```python
class CategoryRule(models.Model):
    keyword     = models.CharField(max_length=255)
    category    = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="rules")
    association = models.ForeignKey(
        Association, null=True, blank=True,
        on_delete=models.CASCADE, related_name="category_rules"
    )
    deleted     = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_categoryrule"

    def __str__(self):
        scope = self.association.name if self.association_id else "global"
        return f"{self.keyword} → {self.category} ({scope})"
```

- [ ] **Step 4: Generate the migration**

```bash
cd HusfelagPy && poetry run python manage.py makemigrations associations --name categoryrule
```

Expected: `Migrations for 'associations': associations/migrations/0017_categoryrule.py`

- [ ] **Step 5: Apply the migration**

```bash
cd HusfelagPy && poetry run python manage.py migrate
```

Expected: `Applying associations.0017_categoryrule... OK`

- [ ] **Step 6: Run test to verify it passes**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryRuleModelTest -v 2
```

Expected: 2 tests PASS

- [ ] **Step 7: Commit**

```bash
cd HusfelagPy && git add associations/models.py associations/migrations/0017_categoryrule.py
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add CategoryRule model and migration"
```

---

## Task 2: categoriser.py module + unit tests

**Files:**
- Create: `HusfelagPy/associations/categoriser.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

In `HusfelagPy/associations/tests.py`, add after `CategoryRuleModelTest`:

```python
class CategoriserTest(TestCase):
    def setUp(self):
        self.association = Association.objects.create(
            ssn="9876543210", name="Félag B",
            address="Brautargata 2", postal_code="200", city="Kópavogur"
        )
        self.assoc2 = Association.objects.create(
            ssn="1111111119", name="Félag C",
            address="Vesturgata 3", postal_code="300", city="Akureyri"
        )
        self.cat_heat = Category.objects.create(name="Hitaveita", type="SHARED")
        self.cat_elec = Category.objects.create(name="Rafmagn", type="SHARED")
        self.cat_maint = Category.objects.create(name="Viðhald", type="SHARED")

    def test_normalise_vendor_strips_trailing_date(self):
        from .categoriser import normalise_vendor
        self.assertEqual(normalise_vendor("HS Veitur hf. 280226"), "hs veitur hf")

    def test_normalise_vendor_strips_reference_numbers(self):
        from .categoriser import normalise_vendor
        self.assertEqual(normalise_vendor("Orka náttúrunnar 12345678"), "orka náttúrunnar")

    def test_normalise_vendor_lowercases(self):
        from .categoriser import normalise_vendor
        self.assertEqual(normalise_vendor("VÍS Tryggingar"), "vís tryggingar")

    def test_categorise_row_association_rule_wins_over_global(self):
        from .models import CategoryRule
        from .categoriser import categorise_row
        CategoryRule.objects.create(keyword="Orka", category=self.cat_heat, association=self.association)
        CategoryRule.objects.create(keyword="Orka", category=self.cat_elec, association=None)
        # assoc rule first in list — simulating build_categorisation_context order
        rules = list(CategoryRule.objects.filter(deleted=False).order_by(
            django_models.Case(
                django_models.When(association=self.association, then=0),
                default=1,
            )
        ))
        result = categorise_row("Orka náttúrunnar", rules, {})
        self.assertEqual(result, self.cat_heat)

    def test_categorise_row_falls_back_to_history(self):
        from .categoriser import categorise_row
        history = {"orka náttúrunnar": self.cat_elec}
        result = categorise_row("Orka náttúrunnar 20260315", [], history)
        self.assertEqual(result, self.cat_elec)

    def test_categorise_row_returns_none_when_no_match(self):
        from .categoriser import categorise_row
        result = categorise_row("Óþekkt greiðsla", [], {})
        self.assertIsNone(result)

    def test_build_categorisation_context_returns_assoc_rules_first(self):
        from .models import CategoryRule
        from .categoriser import build_categorisation_context
        CategoryRule.objects.create(keyword="Global", category=self.cat_elec, association=None)
        CategoryRule.objects.create(keyword="Local", category=self.cat_heat, association=self.association)
        rules, history = build_categorisation_context(self.association)
        self.assertEqual(rules[0].association, self.association)
        self.assertIsNone(rules[1].association)

    def test_build_categorisation_context_excludes_deleted(self):
        from .models import CategoryRule
        from .categoriser import build_categorisation_context
        CategoryRule.objects.create(keyword="Dead", category=self.cat_elec, association=None, deleted=True)
        rules, history = build_categorisation_context(self.association)
        self.assertFalse(any(r.keyword == "Dead" for r in rules))

    def test_build_categorisation_context_history_from_categorised_transactions(self):
        from .models import CategoryRule, BankAccount, Transaction, TransactionStatus
        from .categoriser import build_categorisation_context, normalise_vendor
        bank = BankAccount.objects.create(
            association=self.association, name="Sparnaður", account_number="0111-26-123456"
        )
        Transaction.objects.create(
            bank_account=bank,
            date="2026-01-15",
            amount="-5000",
            description="HS Veitur hf. 280226",
            status=TransactionStatus.CATEGORISED,
            category=self.cat_heat,
        )
        _, history = build_categorisation_context(self.association)
        self.assertEqual(history.get(normalise_vendor("HS Veitur hf. 280226")), self.cat_heat)

    def test_build_categorisation_context_history_excludes_other_association(self):
        from .models import CategoryRule, BankAccount, Transaction, TransactionStatus
        from .categoriser import build_categorisation_context, normalise_vendor
        bank2 = BankAccount.objects.create(
            association=self.assoc2, name="Annar reikningur", account_number="0222-26-999999"
        )
        Transaction.objects.create(
            bank_account=bank2,
            date="2026-01-10",
            amount="-1000",
            description="HS Veitur hf. 100226",
            status=TransactionStatus.CATEGORISED,
            category=self.cat_heat,
        )
        _, history = build_categorisation_context(self.association)
        self.assertNotIn(normalise_vendor("HS Veitur hf. 100226"), history)
```

Note: `django_models` is already imported as `from django.db import models as django_models` in `views.py`, but tests.py needs it too. Add at the top of `tests.py`:

```python
from django.db import models as django_models
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoriserTest -v 2
```

Expected: FAIL — `ImportError: cannot import name 'categoriser'`

- [ ] **Step 3: Create categoriser.py**

Create `HusfelagPy/associations/categoriser.py`:

```python
import re
from .models import CategoryRule, Transaction, TransactionStatus


def normalise_vendor(description: str) -> str:
    """Extract a cleaned vendor name from a bank transaction description.
    Strips trailing reference numbers (6+ digits), dates (DD.MM.YY patterns),
    and trailing punctuation. Lowercases.
    Example: "HS Veitur hf. 280226" -> "hs veitur hf"
    """
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
```

- [ ] **Step 4: Add missing import to tests.py**

At the top of `HusfelagPy/associations/tests.py`, add to the existing imports:

```python
from django.db import models as django_models
```

And add the `Category` import to the existing model imports line. Find the line starting with `from .models import Association` and add `Category, BankAccount, Transaction, TransactionStatus` if not already present. The existing import line should become:

```python
from .models import Association, HMSImportSource, Apartment, Category, BankAccount, Transaction, TransactionStatus
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoriserTest -v 2
```

Expected: 9 tests PASS

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 1
```

Expected: all existing tests + 11 new = no failures

- [ ] **Step 7: Commit**

```bash
cd HusfelagPy && git add associations/categoriser.py associations/tests.py
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add categoriser module with normalise_vendor, build_categorisation_context, categorise_row"
```

---

## Task 3: ImportConfirmView updated to call categoriser + tests

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

In `HusfelagPy/associations/tests.py`, add after `CategoriserTest`:

```python
class ImportConfirmCategorisationTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="1234567890", name="Tester")
        self.association = Association.objects.create(
            ssn="0101013210", name="Flokkunarfélag",
            address="Flokkunargata 1", postal_code="101", city="Reykjavík"
        )
        AssociationAccess.objects.create(user=self.user, association=self.association, active=True)
        self.bank = BankAccount.objects.create(
            association=self.association, name="Aðalreikningur", account_number="0111-26-000001"
        )
        self.cat = Category.objects.create(name="Hitaveita", type="SHARED")

    def _confirm(self, rows):
        return self.client.post(
            "/Import/confirm",
            data=json.dumps({"user_id": self.user.id, "bank_account_id": self.bank.id, "rows": rows}),
            content_type="application/json",
        )

    def test_import_with_matching_rule_categorises_transaction(self):
        from .models import CategoryRule
        CategoryRule.objects.create(keyword="HS Veitur", category=self.cat, association=self.association)
        resp = self._confirm([{"date": "2026-03-01", "amount": "-5000", "description": "HS Veitur hf. 280226", "reference": ""}])
        self.assertEqual(resp.status_code, 201)
        txn = Transaction.objects.filter(bank_account=self.bank).first()
        self.assertEqual(txn.category, self.cat)
        self.assertEqual(txn.status, TransactionStatus.CATEGORISED)

    def test_import_with_no_rule_leaves_status_imported(self):
        resp = self._confirm([{"date": "2026-03-02", "amount": "-1000", "description": "Óþekkt greiðsla", "reference": ""}])
        self.assertEqual(resp.status_code, 201)
        txn = Transaction.objects.filter(bank_account=self.bank).first()
        self.assertIsNone(txn.category)
        self.assertEqual(txn.status, TransactionStatus.IMPORTED)

    def test_import_with_history_match_categorises_transaction(self):
        Transaction.objects.create(
            bank_account=self.bank,
            date="2026-01-01",
            amount="-5000",
            description="HS Veitur hf. 010126",
            status=TransactionStatus.CATEGORISED,
            category=self.cat,
        )
        resp = self._confirm([{"date": "2026-03-01", "amount": "-5000", "description": "HS Veitur hf. 280226", "reference": ""}])
        self.assertEqual(resp.status_code, 201)
        txn = Transaction.objects.filter(bank_account=self.bank, date="2026-03-01").first()
        self.assertEqual(txn.category, self.cat)
        self.assertEqual(txn.status, TransactionStatus.CATEGORISED)
```

Also add `AssociationAccess` to the `tests.py` import from `.models`:

```python
from .models import Association, HMSImportSource, Apartment, Category, BankAccount, Transaction, TransactionStatus, AssociationAccess
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ImportConfirmCategorisationTest -v 2
```

Expected: 3 tests FAIL — transactions are not being categorised (logic not yet wired)

- [ ] **Step 3: Update ImportConfirmView in views.py**

In `HusfelagPy/associations/views.py`, add the categoriser import at the top (after the importers import line):

```python
from .categoriser import build_categorisation_context, categorise_row
```

Then find `ImportConfirmView.post()`. Locate the block:

```python
        transactions = []
        for row in rows:
```

Replace it with:

```python
        rules, history = build_categorisation_context(association)

        transactions = []
        for row in rows:
            try:
                description = str(row.get("description") or "")
                cat = categorise_row(description, rules, history)
                tx_status = TransactionStatus.CATEGORISED if cat else TransactionStatus.IMPORTED
                transactions.append(Transaction(
                    bank_account=bank_account,
                    date=datetime.date.fromisoformat(row["date"]),
                    amount=Decimal(str(row["amount"])),
                    description=description,
                    reference=str(row.get("reference") or ""),
                    category=cat,
                    status=tx_status,
                ))
            except (KeyError, ValueError, Exception):
                continue
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ImportConfirmCategorisationTest -v 2
```

Expected: 3 tests PASS

- [ ] **Step 5: Run full test suite**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 1
```

Expected: all tests pass (no regressions in `ImportViewTest`)

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy && git add associations/views.py associations/tests.py
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: wire categoriser into ImportConfirmView"
```

---

## Task 4: CategoryRuleView CRUD + URLs + tests

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

In `HusfelagPy/associations/tests.py`, add after `ImportConfirmCategorisationTest`:

```python
class CategoryRuleViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="3333333339", name="Reglumaður")
        self.superadmin = User.objects.create(kennitala="9999999999", name="Admin", is_superadmin=True)
        self.association = Association.objects.create(
            ssn="2020202020", name="Reglurfélag",
            address="Reglugata 5", postal_code="105", city="Reykjavík"
        )
        AssociationAccess.objects.create(user=self.user, association=self.association, active=True)
        AssociationAccess.objects.create(user=self.superadmin, association=self.association, active=True)
        self.other_assoc = Association.objects.create(
            ssn="5050505050", name="Annað félag",
            address="Annargata 9", postal_code="200", city="Kópavogur"
        )
        self.cat = Category.objects.create(name="Hitaveita", type="SHARED")

    def test_get_returns_association_and_global_rules(self):
        from .models import CategoryRule
        CategoryRule.objects.create(keyword="Local", category=self.cat, association=self.association)
        CategoryRule.objects.create(keyword="Global", category=self.cat, association=None)
        resp = self.client.get(f"/CategoryRule/{self.user.id}?as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["association_rules"]), 1)
        self.assertEqual(data["association_rules"][0]["keyword"], "Local")
        self.assertEqual(len(data["global_rules"]), 1)
        self.assertEqual(data["global_rules"][0]["keyword"], "Global")

    def test_get_excludes_deleted_rules(self):
        from .models import CategoryRule
        CategoryRule.objects.create(keyword="Dead", category=self.cat, association=self.association, deleted=True)
        resp = self.client.get(f"/CategoryRule/{self.user.id}?as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["association_rules"], [])

    def test_post_creates_association_rule(self):
        resp = self.client.post(
            "/CategoryRule",
            data=json.dumps({"user_id": self.user.id, "keyword": "VÍS", "category_id": self.cat.id, "is_global": False}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["keyword"], "VÍS")
        self.assertFalse(data["is_global"])

    def test_post_global_rule_by_superadmin(self):
        resp = self.client.post(
            "/CategoryRule",
            data=json.dumps({"user_id": self.superadmin.id, "keyword": "Orka", "category_id": self.cat.id, "is_global": True}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertTrue(data["is_global"])

    def test_post_global_rule_by_non_superadmin_returns_403(self):
        resp = self.client.post(
            "/CategoryRule",
            data=json.dumps({"user_id": self.user.id, "keyword": "Orka", "category_id": self.cat.id, "is_global": True}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_post_unknown_category_returns_400(self):
        resp = self.client.post(
            "/CategoryRule",
            data=json.dumps({"user_id": self.user.id, "keyword": "Test", "category_id": 99999, "is_global": False}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_put_updates_keyword(self):
        from .models import CategoryRule
        rule = CategoryRule.objects.create(keyword="Gamalt", category=self.cat, association=self.association)
        resp = self.client.put(
            f"/CategoryRule/update/{rule.id}",
            data=json.dumps({"user_id": self.user.id, "keyword": "Nýtt", "category_id": self.cat.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        rule.refresh_from_db()
        self.assertEqual(rule.keyword, "Nýtt")

    def test_delete_soft_deletes_rule(self):
        from .models import CategoryRule
        rule = CategoryRule.objects.create(keyword="Eyða", category=self.cat, association=self.association)
        resp = self.client.delete(
            f"/CategoryRule/delete/{rule.id}",
            data=json.dumps({"user_id": self.user.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        rule.refresh_from_db()
        self.assertTrue(rule.deleted)

    def test_update_rule_of_other_association_returns_403(self):
        from .models import CategoryRule
        other_rule = CategoryRule.objects.create(
            keyword="Annað", category=self.cat, association=self.other_assoc
        )
        resp = self.client.put(
            f"/CategoryRule/update/{other_rule.id}",
            data=json.dumps({"user_id": self.user.id, "keyword": "Hacked", "category_id": self.cat.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_update_nonexistent_rule_returns_404(self):
        resp = self.client.put(
            "/CategoryRule/update/99999",
            data=json.dumps({"user_id": self.user.id, "keyword": "X", "category_id": self.cat.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryRuleViewTest -v 2
```

Expected: FAIL — 404 on all endpoints (routes not registered)

- [ ] **Step 3: Add CategoryRuleView to views.py**

In `HusfelagPy/associations/views.py`, add the model import for `CategoryRule`. Find the models import block and add `CategoryRule`:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, CategoryType, Budget, BudgetItem, HMSImportSource,
    AccountingKey, AccountingKeyType, BankAccount, Transaction, TransactionStatus,
    CategoryRule,
)
```

Then add the new view class (add it after `ImportConfirmView`):

```python
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

    def post(self, request):
        """POST /CategoryRule — create a rule."""
        user_id    = request.data.get("user_id")
        keyword    = request.data.get("keyword", "").strip()
        category_id = request.data.get("category_id")
        is_global  = bool(request.data.get("is_global", False))

        if not user_id or not keyword or not category_id:
            return Response(
                {"detail": "user_id, keyword og category_id eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(id=int(user_id))
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Notandi fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        try:
            category = Category.objects.get(id=int(category_id), deleted=False)
        except (Category.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_400_BAD_REQUEST)

        if is_global:
            if not user.is_superadmin:
                return Response(
                    {"detail": "Aðeins stjórnendur geta búið til almennar reglur."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            assoc = None
        else:
            assoc = _resolve_assoc(user.id, request)
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
        user_id     = request.data.get("user_id")
        keyword     = request.data.get("keyword", "").strip()
        category_id = request.data.get("category_id")

        if not user_id or not keyword or not category_id:
            return Response(
                {"detail": "user_id, keyword og category_id eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(id=int(user_id))
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Notandi fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        try:
            rule = CategoryRule.objects.get(id=rule_id, deleted=False)
        except CategoryRule.DoesNotExist:
            return Response({"detail": "Regla fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        # Access check
        if rule.association is not None:
            assoc = _resolve_assoc(user.id, request)
            if not assoc or rule.association_id != assoc.id:
                return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not user.is_superadmin:
                return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)

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
        user_id = request.data.get("user_id")

        if not user_id:
            return Response({"detail": "user_id er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=int(user_id))
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Notandi fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        try:
            rule = CategoryRule.objects.get(id=rule_id, deleted=False)
        except CategoryRule.DoesNotExist:
            return Response({"detail": "Regla fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        if rule.association is not None:
            assoc = _resolve_assoc(user.id, request)
            if not assoc or rule.association_id != assoc.id:
                return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not user.is_superadmin:
                return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)

        rule.deleted = True
        rule.save()
        return Response({"deleted": True})
```

- [ ] **Step 4: Register URLs in urls.py**

In `HusfelagPy/associations/urls.py`, add `CategoryRuleView` to the import line:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BankAccountView, TransactionView,
    ImportPreviewView, ImportConfirmView,
    CategoryRuleView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Then add these URL patterns to `urlpatterns` (before the Budget lines):

```python
    path("CategoryRule/<int:user_id>", CategoryRuleView.as_view(), name="categoryrule-list"),
    path("CategoryRule", CategoryRuleView.as_view(), name="categoryrule-create"),
    path("CategoryRule/update/<int:rule_id>", CategoryRuleView.as_view(), name="categoryrule-update"),
    path("CategoryRule/delete/<int:rule_id>", CategoryRuleView.as_view(), name="categoryrule-delete"),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryRuleViewTest -v 2
```

Expected: 10 tests PASS

- [ ] **Step 6: Run full test suite**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 1
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
cd HusfelagPy && git add associations/views.py associations/urls.py associations/tests.py
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add CategoryRuleView CRUD with association and global rule support"
```

---

## Task 5: Frontend — CategorisationRulesPage + Sidebar + App.js

**Files:**
- Create: `HusfelagJS/src/controlers/CategorisationRulesPage.js`
- Modify: `HusfelagJS/src/controlers/Sidebar.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Create CategorisationRulesPage.js**

Create `HusfelagJS/src/controlers/CategorisationRulesPage.js`:

```jsx
import React, { useContext, useEffect, useState } from 'react';
import {
    Box, Typography, Button, CircularProgress, Alert,
    Table, TableHead, TableBody, TableRow, TableCell,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

export default function CategorisationRulesPage() {
    const { user, assocParam } = useContext(UserContext);
    const [assocRules, setAssocRules] = useState([]);
    const [globalRules, setGlobalRules] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editRule, setEditRule] = useState(null); // null = create
    const [editGlobal, setEditGlobal] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Delete confirm dialog
    const [deleteRule, setDeleteRule] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = () => {
        if (!user?.id) return;
        setLoading(true);
        setError('');
        Promise.all([
            fetch(`${API_URL}/CategoryRule/${user.id}${assocParam}`).then(r => r.ok ? r.json() : null),
            fetch(`${API_URL}/Category/list`).then(r => r.ok ? r.json() : []),
        ])
            .then(([rules, cats]) => {
                if (rules) {
                    setAssocRules(rules.association_rules || []);
                    setGlobalRules(rules.global_rules || []);
                }
                setCategories(cats || []);
            })
            .catch(() => setError('Gat ekki sótt gögn.'))
            .finally(() => setLoading(false));
    };

    useEffect(load, [user, assocParam]);

    const openCreate = (isGlobal = false) => {
        setEditRule(null);
        setEditGlobal(isGlobal);
        setKeyword('');
        setCategoryId('');
        setSaveError('');
        setDialogOpen(true);
    };

    const openEdit = (rule, isGlobal) => {
        setEditRule(rule);
        setEditGlobal(isGlobal);
        setKeyword(rule.keyword);
        setCategoryId(rule.category.id);
        setSaveError('');
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!keyword.trim() || !categoryId) {
            setSaveError('Lykilorð og flokkur eru nauðsynleg.');
            return;
        }
        setSaving(true);
        setSaveError('');
        try {
            let resp;
            if (editRule) {
                resp = await fetch(`${API_URL}/CategoryRule/update/${editRule.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId }),
                });
            } else {
                resp = await fetch(`${API_URL}/CategoryRule`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId, is_global: editGlobal }),
                });
            }
            if (resp.ok) {
                setDialogOpen(false);
                load();
            } else {
                const data = await resp.json();
                setSaveError(data.detail || 'Villa við vistun.');
            }
        } catch {
            setSaveError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteRule) return;
        setDeleting(true);
        try {
            const resp = await fetch(`${API_URL}/CategoryRule/delete/${deleteRule.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (resp.ok) {
                setDeleteRule(null);
                load();
            }
        } catch {
            // ignore
        } finally {
            setDeleting(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress color="secondary" /></Box>;

    return (
        <Box sx={{ p: 3, maxWidth: 800 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                    <Typography variant="h6" fontWeight={600}>Flokkunarreglur</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Reglur sem nota lykilorð til að flokka færslur sjálfkrafa við innflutning.
                    </Typography>
                </Box>
                <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={() => openCreate(false)}>
                    + Ný regla
                </Button>
            </Box>

            {/* Association rules */}
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#08C076', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                REGLUR ÞESSA FÉLAGS
            </Typography>
            <RulesTable
                rules={assocRules}
                isGlobal={false}
                canEdit
                onEdit={r => openEdit(r, false)}
                onDelete={r => setDeleteRule(r)}
            />

            {/* Global rules */}
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#aaa', letterSpacing: 0.5, display: 'block', mt: 3, mb: 1 }}>
                ALMENNAR REGLUR
            </Typography>
            <RulesTable
                rules={globalRules}
                isGlobal
                canEdit={!!user?.is_superadmin}
                onEdit={r => openEdit(r, true)}
                onDelete={r => setDeleteRule(r)}
            />

            {user?.is_superadmin && (
                <Button variant="outlined" color="secondary" size="small" sx={{ mt: 2 }} onClick={() => openCreate(true)}>
                    + Almenn regla
                </Button>
            )}

            {/* Create/Edit dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editRule ? 'Breyta reglu' : 'Ný regla'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField
                        label="Lykilorð" value={keyword} size="small" fullWidth autoFocus
                        onChange={e => setKeyword(e.target.value)}
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Flokkur</InputLabel>
                        <Select value={categoryId} label="Flokkur" onChange={e => setCategoryId(e.target.value)}>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    {saveError && <Alert severity="error">{saveError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDialogOpen(false)}>Hætta við</Button>
                    <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete confirm dialog */}
            <Dialog open={!!deleteRule} onClose={() => setDeleteRule(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Eyða reglu</DialogTitle>
                <DialogContent>
                    <Typography>Ertu viss um að þú viljir eyða reglunni <strong>"{deleteRule?.keyword}"</strong>?</Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteRule(null)}>Hætta við</Button>
                    <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
                        {deleting ? <CircularProgress size={18} color="inherit" /> : 'Eyða'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function RulesTable({ rules, isGlobal, canEdit, onEdit, onDelete }) {
    if (rules.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                {isGlobal ? 'Engar almennar reglur skráðar.' : 'Engar reglur skráðar fyrir þetta félag.'}
            </Typography>
        );
    }

    return (
        <Table size="small" sx={{ mb: 1 }}>
            <TableHead>
                <TableRow sx={{ '& th': { color: '#555', fontWeight: 500, borderBottom: '2px solid #eee' } }}>
                    <TableCell>Lykilorð</TableCell>
                    <TableCell>Flokkur</TableCell>
                    <TableCell />
                </TableRow>
            </TableHead>
            <TableBody>
                {rules.map(rule => (
                    <TableRow key={rule.id} sx={{ '& td': { borderBottom: '1px solid #f0f0f0' } }}>
                        <TableCell sx={{ fontFamily: 'monospace', color: isGlobal ? '#888' : '#333' }}>
                            {rule.keyword}
                        </TableCell>
                        <TableCell>
                            <Box component="span" sx={{
                                background: isGlobal ? '#f5f5f5' : '#e8f5e9',
                                color: isGlobal ? '#888' : '#2e7d32',
                                px: 1, py: 0.25, borderRadius: 3, fontSize: 12,
                            }}>
                                {rule.category.name}
                            </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            {canEdit && (
                                <>
                                    <Typography
                                        component="span"
                                        sx={{ color: '#aaa', cursor: 'pointer', fontSize: 12, mr: 1, '&:hover': { color: '#555' } }}
                                        onClick={() => onEdit(rule)}
                                    >
                                        Breyta
                                    </Typography>
                                    <Typography
                                        component="span"
                                        sx={{ color: '#e57373', cursor: 'pointer', fontSize: 12, '&:hover': { color: '#c62828' } }}
                                        onClick={() => onDelete(rule)}
                                    >
                                        Eyða
                                    </Typography>
                                </>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
```

- [ ] **Step 2: Add Flokkunarreglur to Sidebar.js**

In `HusfelagJS/src/controlers/Sidebar.js`, find the `NAV` array:

```js
const NAV = [
    { path: '/husfelag',  label: 'Húsfélag',  icon: <BusinessOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/ibudir',    label: 'Íbúðir',    icon: <HomeOutlinedIcon                  sx={{ fontSize: 20 }} /> },
    { path: '/eigendur',  label: 'Eigendur',  icon: <GroupOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/aaetlun',   label: 'Áætlun',    icon: <AssessmentOutlinedIcon            sx={{ fontSize: 20 }} /> },
    { path: '/faerslur',  label: 'Færslur',   icon: <ReceiptLongOutlinedIcon           sx={{ fontSize: 20 }} /> },
    { path: '/innheimta', label: 'Innheimta', icon: <AccountBalanceWalletOutlinedIcon  sx={{ fontSize: 20 }} /> },
];
```

Add an import for the rules icon at the top of the file (after existing icon imports):

```js
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
```

Then add the Flokkunarreglur entry to `NAV` after `/faerslur`:

```js
const NAV = [
    { path: '/husfelag',         label: 'Húsfélag',         icon: <BusinessOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/ibudir',           label: 'Íbúðir',           icon: <HomeOutlinedIcon                  sx={{ fontSize: 20 }} /> },
    { path: '/eigendur',         label: 'Eigendur',         icon: <GroupOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/aaetlun',          label: 'Áætlun',           icon: <AssessmentOutlinedIcon            sx={{ fontSize: 20 }} /> },
    { path: '/faerslur',         label: 'Færslur',          icon: <ReceiptLongOutlinedIcon           sx={{ fontSize: 20 }} /> },
    { path: '/flokkunarreglur',  label: 'Flokkunarreglur',  icon: <LabelOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/innheimta',        label: 'Innheimta',        icon: <AccountBalanceWalletOutlinedIcon  sx={{ fontSize: 20 }} /> },
];
```

- [ ] **Step 3: Add route in App.js**

In `HusfelagJS/src/App.js`, add the import after the other controller imports:

```js
import CategorisationRulesPage from './controlers/CategorisationRulesPage';
```

Then add the route inside `<Routes>` after the `/faerslur` route:

```jsx
<Route path="/flokkunarreglur" element={<CategorisationRulesPage />} />
```

- [ ] **Step 4: Verify the app compiles**

```bash
cd HusfelagJS && npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully.` — no errors

- [ ] **Step 5: Commit**

```bash
cd HusfelagJS && git add src/controlers/CategorisationRulesPage.js src/controlers/Sidebar.js src/App.js
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "feat: add CategorisationRulesPage with association and global rule management"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `CategoryRule` model (keyword, category, association, deleted) | Task 1 |
| `categoriser.py` — `normalise_vendor`, `build_categorisation_context`, `categorise_row` | Task 2 |
| `ImportConfirmView` calls categoriser before `bulk_create` | Task 3 |
| `CategoryRuleView` GET/POST/PUT/DELETE | Task 4 |
| URL patterns for all 4 endpoints | Task 4 |
| Auth: regular users → assoc rules only; superadmins → global rules | Task 4 |
| `CategorisationRulesPage.js` two sections | Task 5 |
| Sidebar "Flokkunarreglur" entry | Task 5 |
| App.js `/flokkunarreglur` route | Task 5 |
| Error responses (400/403/404) per spec table | Task 4 |
| Tests: `CategoriserTest` | Task 2 |
| Tests: `CategoryRuleViewTest` | Task 4 |
| Tests: `ImportConfirmCategorisationTest` | Task 3 |

**Placeholder scan:** None found — all steps contain complete code.

**Type consistency:** `CategoryRule` referenced identically across Tasks 1–4. `categorise_row` signature matches usage in Task 3.
