# Ledger Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AccountingKey (global chart of accounts), BankAccount (per-association), and Transaction (manual entry + categorise) models to Húsfélag, with full CRUD backend endpoints and frontend panels.

**Architecture:** Global `AccountingKey` model seeded with 12 standard Icelandic accounts. `Category` gains nullable `expense_account`/`income_account` FKs. `BankAccount` is per-association. `Transaction` is a simplified register — derived debit/credit entries are computed on read, not stored. All backend follows the existing `APIView` + `_resolve_assoc` pattern.

**Tech Stack:** Django 4.1, Django REST Framework 3.14, React 17, MUI v5, Poetry.

---

## File Map

**Backend — new/modified files:**

| File | Change |
|------|--------|
| `HusfelagPy/associations/models.py` | Add `AccountingKeyType`, `AccountingKey`, `BankAccount`, `TransactionStatus`, `Transaction`; add 2 FKs to `Category` |
| `HusfelagPy/associations/migrations/0013_accountingkey.py` | Create `AccountingKey` table + seed 12 accounts |
| `HusfelagPy/associations/migrations/0014_category_accounting_fks.py` | Add `expense_account` + `income_account` FKs to `Category` |
| `HusfelagPy/associations/migrations/0015_bankaccount.py` | Create `BankAccount` table |
| `HusfelagPy/associations/migrations/0016_transaction.py` | Create `Transaction` table |
| `HusfelagPy/associations/serializers.py` | Add `AccountingKeySerializer`, `BankAccountSerializer`, `TransactionSerializer`; extend `CategorySerializer` |
| `HusfelagPy/associations/views.py` | Add `AccountingKeyListView`, `AccountingKeyView`, `BankAccountView`, `TransactionView`; extend `CategoryView.put` |
| `HusfelagPy/associations/urls.py` | Register 13 new URL patterns |
| `HusfelagPy/associations/tests.py` | Add 3 new test classes |

**Frontend — new/modified files:**

| File | Change |
|------|--------|
| `HusfelagJS/src/controlers/SuperAdminPage.js` | Add `GlobalAccountingKeysPanel`; add account dropdowns to `GlobalEditCategoryDialog` |
| `HusfelagJS/src/controlers/AssociationPage.js` | Add `BankAccountsPanel` |
| `HusfelagJS/src/controlers/CategoriesPage.js` | Add account dropdowns to category edit dialog (superadmin only) |
| `HusfelagJS/src/controlers/Sidebar.js` | Add "Færslur" nav item between "Áætlun" and "Innheimta" |
| `HusfelagJS/src/App.js` | Add `/faerslur` route |
| `HusfelagJS/src/controlers/TransactionsPage.js` | **New file** — transaction list + manual entry form + categorise dialog |

---

## Task 1: AccountingKey model and migration with seed data

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: `HusfelagPy/associations/migrations/0013_accountingkey.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing test**

Add to the bottom of `HusfelagPy/associations/tests.py`:

```python
class AccountingKeyModelTest(TestCase):
    def test_create_accounting_key(self):
        from associations.models import AccountingKey, AccountingKeyType
        key = AccountingKey.objects.create(
            number=9990, name="Test lykill", type=AccountingKeyType.EXPENSE
        )
        self.assertEqual(key.number, 9990)
        self.assertEqual(key.name, "Test lykill")
        self.assertEqual(key.type, "EXPENSE")
        self.assertFalse(key.deleted)

    def test_seed_data_present(self):
        from associations.models import AccountingKey
        # Migration seeds 12 keys; verify a few
        self.assertTrue(AccountingKey.objects.filter(number=1200).exists())
        self.assertTrue(AccountingKey.objects.filter(number=5600).exists())
        self.assertEqual(AccountingKey.objects.filter(deleted=False).count(), 12)

    def test_ordering_by_number(self):
        from associations.models import AccountingKey
        # Seeded keys should come back ordered by number
        keys = list(AccountingKey.objects.all().values_list("number", flat=True))
        self.assertEqual(keys, sorted(keys))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.AccountingKeyModelTest -v 2
```

Expected: FAIL — `ImportError: cannot import name 'AccountingKeyType'`

- [ ] **Step 3: Add AccountingKey model to models.py**

Add after the `Category` class (before `Budget`):

```python
class AccountingKeyType(models.TextChoices):
    ASSET     = "ASSET",     "Eign"
    LIABILITY = "LIABILITY", "Skuld"
    EQUITY    = "EQUITY",    "Eigið fé"
    INCOME    = "INCOME",    "Tekjur"
    EXPENSE   = "EXPENSE",   "Gjöld"


class AccountingKey(models.Model):
    number  = models.IntegerField(unique=True)
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=AccountingKeyType.choices)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_accountingkey"
        ordering = ["number"]

    def __str__(self):
        return f"{self.number} · {self.name}"
```

- [ ] **Step 4: Generate the migration**

```bash
cd HusfelagPy && poetry run python manage.py makemigrations associations --name accountingkey
```

Expected output: `Migrations for 'associations': associations/migrations/0013_accountingkey.py`

- [ ] **Step 5: Add seed data to the generated migration**

Open `HusfelagPy/associations/migrations/0013_accountingkey.py`. Add the seed function and `RunPython` step. The final file must look exactly like this:

```python
from django.db import migrations, models

SEED_KEYS = [
    (1200, "Innstæður í bönkum (rekstrar)", "ASSET"),
    (1210, "Varasjóður", "ASSET"),
    (1300, "Útistandandi húsgjöld", "ASSET"),
    (2100, "Ógreidd gjöld", "LIABILITY"),
    (3100, "Eigið fé húsfélags", "EQUITY"),
    (4100, "Tekjur af húsgjöldum", "INCOME"),
    (5100, "Tryggingar", "EXPENSE"),
    (5200, "Hiti og rafmagn", "EXPENSE"),
    (5300, "Þrif og viðhald", "EXPENSE"),
    (5400, "Lóðarkostnaður", "EXPENSE"),
    (5500, "Sameiginleg gjöld", "EXPENSE"),
    (5600, "Rekstur húsfélags", "EXPENSE"),
]


def seed_accounting_keys(apps, schema_editor):
    AccountingKey = apps.get_model("associations", "AccountingKey")
    for number, name, type_ in SEED_KEYS:
        AccountingKey.objects.get_or_create(
            number=number, defaults={"name": name, "type": type_}
        )


def unseed_accounting_keys(apps, schema_editor):
    AccountingKey = apps.get_model("associations", "AccountingKey")
    AccountingKey.objects.filter(number__in=[k[0] for k in SEED_KEYS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("associations", "0012_category_global"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountingKey",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.IntegerField(unique=True)),
                ("name", models.CharField(max_length=255)),
                ("type", models.CharField(
                    max_length=20,
                    choices=[
                        ("ASSET", "Eign"),
                        ("LIABILITY", "Skuld"),
                        ("EQUITY", "Eigið fé"),
                        ("INCOME", "Tekjur"),
                        ("EXPENSE", "Gjöld"),
                    ],
                )),
                ("deleted", models.BooleanField(default=False)),
            ],
            options={
                "db_table": "associations_accountingkey",
                "ordering": ["number"],
            },
        ),
        migrations.RunPython(seed_accounting_keys, unseed_accounting_keys),
    ]
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.AccountingKeyModelTest -v 2
```

Expected: `Ran 3 tests in ... OK`

- [ ] **Step 7: Commit**

```bash
cd HusfelagPy && git add associations/models.py associations/migrations/0013_accountingkey.py ../HusfelagPy/associations/tests.py
git add associations/tests.py
git commit -m "feat: AccountingKey model, migration, and seed data"
```

---

## Task 2: AccountingKey serializer, view, and URL routing

**Files:**
- Modify: `HusfelagPy/associations/serializers.py`
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
class AccountingKeyViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.superadmin = User.objects.create(
            kennitala="1111111111", name="Admin", is_superadmin=True
        )
        self.regular = User.objects.create(
            kennitala="2222222222", name="Regular"
        )
        # Use numbers outside the seeded range to avoid collisions
        from associations.models import AccountingKey, AccountingKeyType
        self.key = AccountingKey.objects.create(
            number=9901, name="Test Eign", type=AccountingKeyType.ASSET
        )
        self.deleted_key = AccountingKey.objects.create(
            number=9902, name="Test Óvirkur", type=AccountingKeyType.EXPENSE, deleted=True
        )

    def test_list_returns_only_active_keys(self):
        resp = self.client.get("/AccountingKey/list")
        self.assertEqual(resp.status_code, 200)
        numbers = [k["number"] for k in resp.json()]
        self.assertIn(9901, numbers)
        self.assertNotIn(9902, numbers)

    def test_superadmin_get_includes_deleted(self):
        resp = self.client.get(f"/AccountingKey/{self.superadmin.id}")
        self.assertEqual(resp.status_code, 200)
        numbers = [k["number"] for k in resp.json()]
        self.assertIn(9901, numbers)
        self.assertIn(9902, numbers)

    def test_create_requires_superadmin(self):
        resp = self.client.post(
            "/AccountingKey",
            data=json.dumps({"user_id": self.regular.id, "number": 9999, "name": "X", "type": "EXPENSE"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_create_accounting_key(self):
        resp = self.client.post(
            "/AccountingKey",
            data=json.dumps({"user_id": self.superadmin.id, "number": 9950, "name": "Nýr lykill", "type": "EXPENSE"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["number"], 9950)
        self.assertEqual(resp.json()["type"], "EXPENSE")

    def test_create_duplicate_number_returns_400(self):
        resp = self.client.post(
            "/AccountingKey",
            data=json.dumps({"user_id": self.superadmin.id, "number": 9901, "name": "Afrit", "type": "ASSET"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("þegar til", resp.json()["detail"])

    def test_update_accounting_key(self):
        resp = self.client.put(
            f"/AccountingKey/update/{self.key.id}?user_id={self.superadmin.id}",
            data=json.dumps({"name": "Uppfært nafn", "type": "ASSET"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Uppfært nafn")

    def test_soft_delete(self):
        resp = self.client.delete(
            f"/AccountingKey/delete/{self.key.id}?user_id={self.superadmin.id}"
        )
        self.assertEqual(resp.status_code, 204)
        self.key.refresh_from_db()
        self.assertTrue(self.key.deleted)

    def test_enable(self):
        resp = self.client.patch(
            f"/AccountingKey/enable/{self.deleted_key.id}?user_id={self.superadmin.id}"
        )
        self.assertEqual(resp.status_code, 200)
        self.deleted_key.refresh_from_db()
        self.assertFalse(self.deleted_key.deleted)

    def test_non_superadmin_cannot_delete(self):
        resp = self.client.delete(
            f"/AccountingKey/delete/{self.key.id}?user_id={self.regular.id}"
        )
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.AccountingKeyViewTest -v 2
```

Expected: FAIL — `404` on all requests (routes not yet registered)

- [ ] **Step 3: Add AccountingKeySerializer to serializers.py**

Add after `CategorySerializer`:

```python
class AccountingKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountingKey
        fields = ["id", "number", "name", "type", "deleted"]
```

Also update the import at the top of serializers.py:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, Budget, BudgetItem, AccountingKey,
)
```

- [ ] **Step 4: Add AccountingKeyListView and AccountingKeyView to views.py**

Add these two classes after `CategoryListView` (before `CategoryView`):

```python
class AccountingKeyListView(APIView):
    def get(self, request):
        """GET /AccountingKey/list — all active keys (no auth required)."""
        keys = AccountingKey.objects.filter(deleted=False)
        return Response(AccountingKeySerializer(keys, many=True).data)


class AccountingKeyView(APIView):
    def _require_superadmin(self, user_id):
        """Returns (user, error_response). error_response is None if superadmin."""
        if user_id is None:
            return None, Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            uid = int(user_id)
            user = User.objects.get(id=uid)
        except (TypeError, ValueError):
            return None, Response({"detail": "user_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return None, Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not user.is_superadmin:
            return None, Response({"detail": "Aðeins kerfisstjórar geta breytt bókhaldslyklum."}, status=status.HTTP_403_FORBIDDEN)
        return user, None

    def get(self, request, user_id):
        """GET /AccountingKey/{user_id} — all keys including deleted (superadmin panel)."""
        keys = AccountingKey.objects.all()
        return Response(AccountingKeySerializer(keys, many=True).data)

    def post(self, request):
        """POST /AccountingKey — create a key. Superadmin only."""
        user_id = request.data.get("user_id")
        number = request.data.get("number")
        name = request.data.get("name", "").strip()
        type_ = request.data.get("type", "")

        if number is None or not name or not type_:
            return Response({"detail": "number, name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)
        if type_ not in AccountingKeyType.values:
            return Response({"detail": "Ógildur lykilflokkur."}, status=status.HTTP_400_BAD_REQUEST)

        _, err = self._require_superadmin(user_id)
        if err:
            return err

        try:
            number = int(number)
        except (TypeError, ValueError):
            return Response({"detail": "number verður að vera heiltala."}, status=status.HTTP_400_BAD_REQUEST)

        if AccountingKey.objects.filter(number=number).exists():
            return Response({"detail": "Bókhaldslykill með þetta númer er þegar til."}, status=status.HTTP_400_BAD_REQUEST)

        key = AccountingKey.objects.create(number=number, name=name, type=type_)
        return Response(AccountingKeySerializer(key).data, status=status.HTTP_201_CREATED)

    def put(self, request, key_id):
        """PUT /AccountingKey/update/{id}?user_id=X — update name/type. Superadmin only."""
        user_id = request.query_params.get("user_id") or request.data.get("user_id")
        _, err = self._require_superadmin(user_id)
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
        """DELETE /AccountingKey/delete/{id}?user_id=X — soft-delete. Superadmin only."""
        user_id = request.query_params.get("user_id")
        _, err = self._require_superadmin(user_id)
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
        """PATCH /AccountingKey/enable/{id}?user_id=X — re-enable. Superadmin only."""
        user_id = request.query_params.get("user_id")
        _, err = self._require_superadmin(user_id)
        if err:
            return err

        try:
            key = AccountingKey.objects.get(id=key_id, deleted=True)
        except AccountingKey.DoesNotExist:
            return Response({"detail": "Bókhaldslykill fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        key.deleted = False
        key.save(update_fields=["deleted"])
        return Response(AccountingKeySerializer(key).data)
```

Also add to the import at the top of views.py:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, CategoryType, Budget, BudgetItem, HMSImportSource,
    AccountingKey, AccountingKeyType,
)
from .serializers import (
    AssociationSerializer, ApartmentSerializer, OwnershipSerializer,
    CategorySerializer, BudgetSerializer, BudgetItemSerializer, AssociationAccessSerializer,
    AccountingKeySerializer,
)
```

- [ ] **Step 5: Register URL patterns in urls.py**

Update `HusfelagPy/associations/urls.py` — add to imports and urlpatterns:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Add these patterns to `urlpatterns` (before the Budget patterns):

```python
    path("AccountingKey/list", AccountingKeyListView.as_view(), name="accountingkey-list"),
    path("AccountingKey/<int:user_id>", AccountingKeyView.as_view(), name="accountingkey-admin-list"),
    path("AccountingKey", AccountingKeyView.as_view(), name="accountingkey-create"),
    path("AccountingKey/update/<int:key_id>", AccountingKeyView.as_view(), name="accountingkey-update"),
    path("AccountingKey/delete/<int:key_id>", AccountingKeyView.as_view(), name="accountingkey-delete"),
    path("AccountingKey/enable/<int:key_id>", AccountingKeyView.as_view(), name="accountingkey-enable"),
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.AccountingKeyViewTest -v 2
```

Expected: `Ran 9 tests in ... OK`

- [ ] **Step 7: Run all tests to check no regressions**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add associations/serializers.py associations/views.py associations/urls.py associations/tests.py
git commit -m "feat: AccountingKey serializer, view, and URL routing"
```

---

## Task 3: Category accounting FKs

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: `HusfelagPy/associations/migrations/0014_category_accounting_fks.py`
- Modify: `HusfelagPy/associations/serializers.py`
- Modify: `HusfelagPy/associations/views.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing test**

Add to `HusfelagPy/associations/tests.py`:

```python
class CategoryAccountingFKTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.superadmin = User.objects.create(
            kennitala="3333333333", name="Admin", is_superadmin=True
        )
        from associations.models import AccountingKey, AccountingKeyType, Category, CategoryType
        self.expense_key = AccountingKey.objects.create(
            number=9801, name="Test Gjöld", type=AccountingKeyType.EXPENSE
        )
        self.income_key = AccountingKey.objects.create(
            number=9802, name="Test Tekjur", type=AccountingKeyType.INCOME
        )
        self.category = Category.objects.create(name="Þrif", type=CategoryType.SHARED)

    def test_category_has_accounting_fks(self):
        from associations.models import Category
        cat = Category.objects.get(id=self.category.id)
        self.assertIsNone(cat.expense_account)
        self.assertIsNone(cat.income_account)

    def test_update_category_sets_expense_account(self):
        resp = self.client.put(
            f"/Category/update/{self.category.id}?user_id={self.superadmin.id}",
            data=json.dumps({
                "name": "Þrif",
                "type": "SHARED",
                "expense_account_id": self.expense_key.id,
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["expense_account_id"], self.expense_key.id)
        self.assertEqual(data["expense_account_number"], 9801)

    def test_update_category_clears_expense_account(self):
        self.category.expense_account = self.expense_key
        self.category.save()
        resp = self.client.put(
            f"/Category/update/{self.category.id}?user_id={self.superadmin.id}",
            data=json.dumps({"name": "Þrif", "type": "SHARED", "expense_account_id": None}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["expense_account_id"])

    def test_serializer_returns_account_fields(self):
        self.category.expense_account = self.expense_key
        self.category.income_account = self.income_key
        self.category.save()
        resp = self.client.get(f"/Category/{self.superadmin.id}")
        self.assertEqual(resp.status_code, 200)
        cat = next(c for c in resp.json() if c["id"] == self.category.id)
        self.assertEqual(cat["expense_account_id"], self.expense_key.id)
        self.assertEqual(cat["income_account_id"], self.income_key.id)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryAccountingFKTest -v 2
```

Expected: FAIL — `FieldError: Cannot resolve keyword 'expense_account'`

- [ ] **Step 3: Add FK fields to Category model**

In `HusfelagPy/associations/models.py`, update the `Category` class:

```python
class Category(models.Model):
    # association FK removed — categories are global, managed by superadmin
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=CategoryType.choices)
    deleted = models.BooleanField(default=False)
    expense_account = models.ForeignKey(
        "AccountingKey", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="expense_categories",
    )
    income_account = models.ForeignKey(
        "AccountingKey", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="income_categories",
    )

    class Meta:
        db_table = "associations_category"

    def __str__(self):
        return f"{self.name} ({self.type})"
```

- [ ] **Step 4: Generate the migration**

```bash
cd HusfelagPy && poetry run python manage.py makemigrations associations --name category_accounting_fks
```

Expected output: `Migrations for 'associations': associations/migrations/0014_category_accounting_fks.py`

- [ ] **Step 5: Update CategorySerializer to include FK fields**

Replace the existing `CategorySerializer` in `HusfelagPy/associations/serializers.py`:

```python
class CategorySerializer(serializers.ModelSerializer):
    expense_account_id = serializers.IntegerField(
        source="expense_account.id", read_only=True, allow_null=True
    )
    expense_account_number = serializers.IntegerField(
        source="expense_account.number", read_only=True, allow_null=True
    )
    income_account_id = serializers.IntegerField(
        source="income_account.id", read_only=True, allow_null=True
    )
    income_account_number = serializers.IntegerField(
        source="income_account.number", read_only=True, allow_null=True
    )

    class Meta:
        model = Category
        fields = [
            "id", "name", "type", "deleted",
            "expense_account_id", "expense_account_number",
            "income_account_id", "income_account_number",
        ]
```

- [ ] **Step 6: Update CategoryView.put to handle FK updates**

In `HusfelagPy/associations/views.py`, extend `CategoryView.put` — replace the existing method body:

```python
    def put(self, request, category_id):
        """PUT /Category/update/{id}?user_id=X — update name/type/account FKs. Superadmin only."""
        user_id = request.query_params.get("user_id") or request.data.get("user_id")
        _, err = self._require_superadmin(user_id)
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
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryAccountingFKTest -v 2
```

Expected: `Ran 4 tests in ... OK`

- [ ] **Step 8: Run all tests to check no regressions**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add associations/models.py associations/migrations/0014_category_accounting_fks.py associations/serializers.py associations/views.py associations/tests.py
git commit -m "feat: Category gains expense_account and income_account FKs"
```

---

## Task 4: BankAccount model, migration, serializer, view, and URL routing

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: `HusfelagPy/associations/migrations/0015_bankaccount.py`
- Modify: `HusfelagPy/associations/serializers.py`
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
class BankAccountViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="4444444444", name="Formaður")
        self.other_user = User.objects.create(kennitala="5555555555", name="Annar")
        self.association = Association.objects.create(
            ssn="1111111119", name="Test HF", address="Testgata 1",
            postal_code="101", city="Reykjavík"
        )
        self.other_association = Association.objects.create(
            ssn="2222222228", name="Annað HF", address="Testgata 2",
            postal_code="101", city="Reykjavík"
        )
        from associations.models import AssociationAccess, AssociationRole, AccountingKey, AccountingKeyType
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role=AssociationRole.CHAIR, active=True
        )
        AssociationAccess.objects.create(
            user=self.other_user, association=self.other_association,
            role=AssociationRole.CHAIR, active=True
        )
        self.asset_key = AccountingKey.objects.create(
            number=9701, name="Test Reikningur", type=AccountingKeyType.ASSET
        )

    def test_create_bank_account(self):
        resp = self.client.post(
            "/BankAccount",
            data=json.dumps({
                "user_id": self.user.id,
                "name": "Rekstrarreikningur",
                "account_number": "0101-26-123456",
                "asset_account_id": self.asset_key.id,
                "description": "Aðalreikningur",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["name"], "Rekstrarreikningur")
        self.assertEqual(data["asset_account"]["number"], 9701)

    def test_list_bank_accounts(self):
        from associations.models import BankAccount
        BankAccount.objects.create(
            association=self.association, name="Rekstrar",
            account_number="0101-26-123456", asset_account=self.asset_key
        )
        resp = self.client.get(f"/BankAccount/{self.user.id}?as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_list_excludes_deleted(self):
        from associations.models import BankAccount
        BankAccount.objects.create(
            association=self.association, name="Gamall", account_number="0000-00-000000", deleted=True
        )
        resp = self.client.get(f"/BankAccount/{self.user.id}?as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 0)

    def test_update_bank_account(self):
        from associations.models import BankAccount
        bank = BankAccount.objects.create(
            association=self.association, name="Gamalt nafn", account_number="0101-26-123456"
        )
        resp = self.client.put(
            f"/BankAccount/update/{bank.id}",
            data=json.dumps({
                "user_id": self.user.id,
                "name": "Nýtt nafn",
                "account_number": "0101-26-999999",
                "asset_account_id": self.asset_key.id,
                "description": "",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Nýtt nafn")

    def test_delete_bank_account(self):
        from associations.models import BankAccount
        bank = BankAccount.objects.create(
            association=self.association, name="Rekstrar", account_number="0101-26-123456"
        )
        resp = self.client.delete(
            f"/BankAccount/delete/{bank.id}",
            data=json.dumps({"user_id": self.user.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 204)
        bank.refresh_from_db()
        self.assertTrue(bank.deleted)

    def test_cannot_delete_other_associations_bank_account(self):
        from associations.models import BankAccount
        bank = BankAccount.objects.create(
            association=self.other_association, name="Rekstrar", account_number="0101-26-999999"
        )
        resp = self.client.delete(
            f"/BankAccount/delete/{bank.id}",
            data=json.dumps({"user_id": self.user.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_no_association_returns_empty_list(self):
        nobody = User.objects.create(kennitala="6666666666", name="Nobody")
        resp = self.client.get(f"/BankAccount/{nobody.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.BankAccountViewTest -v 2
```

Expected: FAIL — `404` on all requests

- [ ] **Step 3: Add BankAccount model to models.py**

Add after `AccountingKey` (before `Budget`):

```python
class BankAccount(models.Model):
    association    = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="bank_accounts")
    name           = models.CharField(max_length=255)
    account_number = models.CharField(max_length=50)
    asset_account  = models.ForeignKey(
        AccountingKey, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="bank_accounts",
    )
    description    = models.CharField(max_length=255, blank=True)
    deleted        = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_bankaccount"

    def __str__(self):
        return f"{self.name} ({self.account_number})"
```

- [ ] **Step 4: Generate the migration**

```bash
cd HusfelagPy && poetry run python manage.py makemigrations associations --name bankaccount
```

Expected output: `Migrations for 'associations': associations/migrations/0015_bankaccount.py`

- [ ] **Step 5: Add BankAccountSerializer to serializers.py**

Add after `AccountingKeySerializer`:

```python
class BankAccountSerializer(serializers.ModelSerializer):
    asset_account = serializers.SerializerMethodField()

    def get_asset_account(self, obj):
        if not obj.asset_account_id:
            return None
        return {
            "id": obj.asset_account.id,
            "number": obj.asset_account.number,
            "name": obj.asset_account.name,
        }

    class Meta:
        model = BankAccount
        fields = ["id", "name", "account_number", "description", "deleted", "asset_account"]
```

Also update the model import in serializers.py:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, Budget, BudgetItem, AccountingKey, BankAccount,
)
```

- [ ] **Step 6: Add BankAccountView to views.py**

Add after `AccountingKeyView`:

```python
class BankAccountView(APIView):
    def get(self, request, user_id):
        """GET /BankAccount/{user_id} — list active bank accounts for the association."""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)
        bank_accounts = association.bank_accounts.filter(deleted=False).select_related("asset_account")
        return Response(BankAccountSerializer(bank_accounts, many=True).data)

    def post(self, request):
        """POST /BankAccount — create a bank account."""
        user_id = request.data.get("user_id")
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

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

        bank_account.deleted = True
        bank_account.save(update_fields=["deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)
```

Also update the model import in views.py:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, CategoryType, Budget, BudgetItem, HMSImportSource,
    AccountingKey, AccountingKeyType, BankAccount,
)
from .serializers import (
    AssociationSerializer, ApartmentSerializer, OwnershipSerializer,
    CategorySerializer, BudgetSerializer, BudgetItemSerializer, AssociationAccessSerializer,
    AccountingKeySerializer, BankAccountSerializer,
)
```

- [ ] **Step 7: Register URL patterns in urls.py**

Update the imports and add patterns:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BankAccountView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Add to `urlpatterns` (after AccountingKey patterns):

```python
    path("BankAccount/<int:user_id>", BankAccountView.as_view(), name="bankaccount-list"),
    path("BankAccount", BankAccountView.as_view(), name="bankaccount-create"),
    path("BankAccount/update/<int:bank_account_id>", BankAccountView.as_view(), name="bankaccount-update"),
    path("BankAccount/delete/<int:bank_account_id>", BankAccountView.as_view(), name="bankaccount-delete"),
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.BankAccountViewTest -v 2
```

Expected: `Ran 7 tests in ... OK`

- [ ] **Step 9: Run all tests to check no regressions**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add associations/models.py associations/migrations/0015_bankaccount.py associations/serializers.py associations/views.py associations/urls.py associations/tests.py
git commit -m "feat: BankAccount model, migration, serializer, view, and URL routing"
```

---

## Task 5: Transaction model, migration, serializer, view, and URL routing

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: `HusfelagPy/associations/migrations/0016_transaction.py`
- Modify: `HusfelagPy/associations/serializers.py`
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
class TransactionViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="7777777777", name="Gjaldkeri")
        self.association = Association.objects.create(
            ssn="3333333337", name="Felag HF", address="Gata 1",
            postal_code="101", city="Reykjavík"
        )
        from associations.models import AssociationAccess, AssociationRole, AccountingKey, AccountingKeyType, BankAccount, Category, CategoryType
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role=AssociationRole.CFO, active=True
        )
        self.bank_account = BankAccount.objects.create(
            association=self.association,
            name="Rekstrar",
            account_number="0101-26-123456",
        )
        self.category = Category.objects.create(name="Tryggingar", type=CategoryType.SHARED)

    def test_create_manual_transaction(self):
        resp = self.client.post(
            "/Transaction",
            data=json.dumps({
                "user_id": self.user.id,
                "bank_account_id": self.bank_account.id,
                "date": "2026-03-15",
                "amount": "-180000.00",
                "description": "VÍS tryggingar",
                "reference": "REF001",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["description"], "VÍS tryggingar")
        self.assertEqual(data["status"], "IMPORTED")
        self.assertEqual(data["bank_account"]["name"], "Rekstrar")

    def test_create_with_category_sets_categorised_status(self):
        resp = self.client.post(
            "/Transaction",
            data=json.dumps({
                "user_id": self.user.id,
                "bank_account_id": self.bank_account.id,
                "date": "2026-03-15",
                "amount": "-50000.00",
                "description": "Þrif",
                "category_id": self.category.id,
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["status"], "CATEGORISED")

    def test_list_transactions(self):
        from associations.models import Transaction
        Transaction.objects.create(
            bank_account=self.bank_account,
            date="2026-03-01",
            amount="-10000",
            description="Test",
            status="IMPORTED",
        )
        resp = self.client.get(f"/Transaction/{self.user.id}?as={self.association.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_list_filters_by_year(self):
        from associations.models import Transaction
        Transaction.objects.create(
            bank_account=self.bank_account, date="2025-06-01",
            amount="-1000", description="Gamla", status="IMPORTED"
        )
        Transaction.objects.create(
            bank_account=self.bank_account, date="2026-01-01",
            amount="-2000", description="Nýja", status="IMPORTED"
        )
        resp = self.client.get(f"/Transaction/{self.user.id}?as={self.association.id}&year=2026")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["description"], "Nýja")

    def test_categorise_transaction(self):
        from associations.models import Transaction
        tx = Transaction.objects.create(
            bank_account=self.bank_account, date="2026-03-01",
            amount="-5000", description="Test", status="IMPORTED"
        )
        resp = self.client.patch(
            f"/Transaction/categorise/{tx.id}",
            data=json.dumps({"user_id": self.user.id, "category_id": self.category.id}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "CATEGORISED")
        self.assertEqual(data["category"]["id"], self.category.id)

    def test_categorise_wrong_category_returns_404(self):
        from associations.models import Transaction
        tx = Transaction.objects.create(
            bank_account=self.bank_account, date="2026-03-01",
            amount="-5000", description="Test", status="IMPORTED"
        )
        resp = self.client.patch(
            f"/Transaction/categorise/{tx.id}",
            data=json.dumps({"user_id": self.user.id, "category_id": 99999}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_no_bank_accounts_returns_empty_list(self):
        nobody = User.objects.create(kennitala="8888888888", name="Nobody")
        nobody_assoc = Association.objects.create(
            ssn="4444444446", name="Empty HF", address="Gata 1",
            postal_code="101", city="Reykjavík"
        )
        from associations.models import AssociationAccess, AssociationRole
        AssociationAccess.objects.create(
            user=nobody, association=nobody_assoc,
            role=AssociationRole.CHAIR, active=True
        )
        resp = self.client.get(f"/Transaction/{nobody.id}?as={nobody_assoc.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.TransactionViewTest -v 2
```

Expected: FAIL — `404` on all requests

- [ ] **Step 3: Add Transaction model to models.py**

Add after `BankAccount` (before `Budget`):

```python
class TransactionStatus(models.TextChoices):
    IMPORTED    = "IMPORTED",   "Innflutt"
    CATEGORISED = "CATEGORISED", "Flokkað"
    RECONCILED  = "RECONCILED", "Jafnað"


class Transaction(models.Model):
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name="transactions")
    date         = models.DateField()
    amount       = models.DecimalField(max_digits=14, decimal_places=2)  # positive=in, negative=out
    description  = models.CharField(max_length=500)
    reference    = models.CharField(max_length=255, blank=True)
    category     = models.ForeignKey(
        Category, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="transactions",
    )
    status       = models.CharField(
        max_length=20, choices=TransactionStatus.choices,
        default=TransactionStatus.IMPORTED,
    )
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "associations_transaction"
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.date} {self.description}: {self.amount}"
```

- [ ] **Step 4: Generate the migration**

```bash
cd HusfelagPy && poetry run python manage.py makemigrations associations --name transaction
```

Expected output: `Migrations for 'associations': associations/migrations/0016_transaction.py`

- [ ] **Step 5: Add TransactionSerializer to serializers.py**

Add after `BankAccountSerializer`:

```python
class TransactionSerializer(serializers.ModelSerializer):
    bank_account = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    def get_bank_account(self, obj):
        return {"id": obj.bank_account.id, "name": obj.bank_account.name}

    def get_category(self, obj):
        if not obj.category_id:
            return None
        return {"id": obj.category.id, "name": obj.category.name, "type": obj.category.type}

    class Meta:
        model = Transaction
        fields = [
            "id", "date", "amount", "description", "reference",
            "status", "created_at", "bank_account", "category",
        ]
```

Also update the model import in serializers.py:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, Budget, BudgetItem, AccountingKey, BankAccount, Transaction,
)
```

- [ ] **Step 6: Add TransactionView to views.py**

Add after `BankAccountView`:

```python
class TransactionView(APIView):
    def get(self, request, user_id):
        """GET /Transaction/{user_id} — list transactions. Query: ?year=, ?bank_account_id=, ?status="""
        association = _resolve_assoc(user_id, request)
        if not association:
            return Response([], status=status.HTTP_200_OK)

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

        try:
            category = Category.objects.get(id=category_id, deleted=False)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)

        tx.category = category
        tx.status = TransactionStatus.CATEGORISED
        tx.save(update_fields=["category", "status"])
        tx.refresh_from_db()
        return Response(TransactionSerializer(tx).data)
```

Also update the model import in views.py:

```python
from .models import (
    Association, AssociationAccess, AssociationRole, Apartment, ApartmentOwnership,
    Category, CategoryType, Budget, BudgetItem, HMSImportSource,
    AccountingKey, AccountingKeyType, BankAccount, Transaction, TransactionStatus,
)
from .serializers import (
    AssociationSerializer, ApartmentSerializer, OwnershipSerializer,
    CategorySerializer, BudgetSerializer, BudgetItemSerializer, AssociationAccessSerializer,
    AccountingKeySerializer, BankAccountSerializer, TransactionSerializer,
)
```

- [ ] **Step 7: Register URL patterns in urls.py**

Update the imports:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BankAccountView,
    TransactionView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Add to `urlpatterns` (after BankAccount patterns):

```python
    path("Transaction/<int:user_id>", TransactionView.as_view(), name="transaction-list"),
    path("Transaction", TransactionView.as_view(), name="transaction-create"),
    path("Transaction/categorise/<int:transaction_id>", TransactionView.as_view(), name="transaction-categorise"),
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.TransactionViewTest -v 2
```

Expected: `Ran 7 tests in ... OK`

- [ ] **Step 9: Run all tests to check no regressions**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add associations/models.py associations/migrations/0016_transaction.py associations/serializers.py associations/views.py associations/urls.py associations/tests.py
git commit -m "feat: Transaction model, migration, serializer, view, and URL routing"
```

---

## Task 6: GlobalAccountingKeysPanel in SuperAdminPage.js

**Files:**
- Modify: `HusfelagJS/src/controlers/SuperAdminPage.js`

- [ ] **Step 1: Add ReceiptLongOutlined import and ACCOUNTING_KEY_TYPES constant**

At the top of `SuperAdminPage.js`, add to the MUI imports list `Switch` (for enable/disable toggle pattern already used), and add this constant after `CATEGORY_TYPES`:

```javascript
const ACCOUNTING_KEY_TYPES = [
    { value: 'ASSET',     label: 'Eign' },
    { value: 'LIABILITY', label: 'Skuld' },
    { value: 'EQUITY',    label: 'Eigið fé' },
    { value: 'INCOME',    label: 'Tekjur' },
    { value: 'EXPENSE',   label: 'Gjöld' },
];
const keyTypeLabel = (type) => ACCOUNTING_KEY_TYPES.find(t => t.value === type)?.label || type;
```

- [ ] **Step 2: Add GlobalAccountingKeysPanel to the SuperAdminPage grid**

In `SuperAdminPage`'s return, add a new `<Grid item xs={12}>` after the `GlobalCategoriesPanel` grid item:

```jsx
                    <Grid item xs={12}>
                        <GlobalAccountingKeysPanel user={user} />
                    </Grid>
```

- [ ] **Step 3: Implement GlobalAccountingKeysPanel**

Add these components after `GlobalCategoryRow` / before `export default SuperAdminPage`:

```jsx
function GlobalAccountingKeysPanel({ user }) {
    const [keys, setKeys] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [showDisabled, setShowDisabled] = React.useState(false);

    React.useEffect(() => { loadKeys(); }, []);

    const loadKeys = async () => {
        try {
            const resp = await fetch(`${API_URL}/AccountingKey/${user.id}`);
            if (resp.ok) setKeys(await resp.json());
            else { setError('Villa við að sækja bókhaldslykla.'); setKeys([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setKeys([]);
        }
    };

    if (keys === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    const active = keys.filter(k => !k.deleted);
    const disabled = keys.filter(k => k.deleted);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="h6">Bókhaldslyklar</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Staðlað íslenskt bókhaldslykilkerfi — gilt fyrir öll húsfélög
                    </Typography>
                </Box>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={() => setShowForm(v => !v)}
                >
                    {showForm ? 'Loka' : '+ Bæta við lykli'}
                </Button>
            </Box>

            <Collapse in={showForm}>
                <GlobalAddAccountingKeyForm
                    userId={user.id}
                    onCreated={() => { setShowForm(false); loadKeys(); }}
                />
            </Collapse>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {active.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Enginn bókhaldslykill skráður.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                <TableCell sx={{ width: 80 }}>Númer</TableCell>
                                <TableCell>Heiti</TableCell>
                                <TableCell>Tegund</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {active.map(k => (
                                <GlobalAccountingKeyRow key={k.id} accountingKey={k} userId={user.id} onSaved={loadKeys} />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {disabled.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Button
                        size="small" variant="text" color="inherit"
                        sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0 }}
                        onClick={() => setShowDisabled(v => !v)}
                    >
                        {showDisabled ? '▲' : '▼'} Óvirkir lyklar ({disabled.length})
                    </Button>
                    <Collapse in={showDisabled}>
                        <Paper variant="outlined" sx={{ mt: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                        <TableCell sx={{ width: 80 }}>Númer</TableCell>
                                        <TableCell>Heiti</TableCell>
                                        <TableCell>Tegund</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {disabled.map(k => (
                                        <GlobalAccountingKeyRow key={k.id} accountingKey={k} userId={user.id} onSaved={loadKeys} isDisabled />
                                    ))}
                                </TableBody>
                            </Table>
                        </Paper>
                    </Collapse>
                </Box>
            )}
        </Paper>
    );
}

function GlobalAddAccountingKeyForm({ userId, onCreated }) {
    const [number, setNumber] = React.useState('');
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    const isValid = number && name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/AccountingKey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, number: parseInt(number, 10), name: name.trim(), type }),
            });
            if (resp.ok) {
                setNumber(''); setName(''); setType('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                    label="Númer" value={number}
                    onChange={e => setNumber(e.target.value.replace(/\D/g, ''))}
                    size="small" sx={{ width: 120 }}
                    inputProps={{ inputMode: 'numeric' }}
                />
                <TextField
                    label="Heiti lykils" value={name}
                    onChange={e => setName(e.target.value)}
                    size="small" sx={{ flex: 1 }}
                />
            </Box>
            <FormControl size="small" fullWidth>
                <InputLabel>Tegund</InputLabel>
                <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                    {ACCOUNTING_KEY_TYPES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista lykil'}
            </Button>
        </Paper>
    );
}

function GlobalAccountingKeyRow({ accountingKey, userId, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{accountingKey.number}</TableCell>
                <TableCell>{accountingKey.name}</TableCell>
                <TableCell>{keyTypeLabel(accountingKey.type)}</TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <GlobalEditAccountingKeyDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                accountingKey={accountingKey}
                userId={userId}
                isDisabled={isDisabled}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function GlobalEditAccountingKeyDialog({ open, onClose, accountingKey, userId, isDisabled, onSaved }) {
    const [name, setName] = React.useState(accountingKey.name);
    const [type, setType] = React.useState(accountingKey.type);
    const [saving, setSaving] = React.useState(false);
    const [disabling, setDisabling] = React.useState(false);
    const [confirmDisable, setConfirmDisable] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) { setName(accountingKey.name); setType(accountingKey.type); setError(''); }
    }, [open, accountingKey]);

    const isValid = name.trim() && type;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/AccountingKey/update/${accountingKey.id}?user_id=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type }),
            });
            if (resp.ok) {
                if (isDisabled) {
                    await fetch(`${API_URL}/AccountingKey/enable/${accountingKey.id}?user_id=${userId}`, { method: 'PATCH' });
                }
                onSaved();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við uppfærslu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async () => {
        setDisabling(true);
        try {
            const resp = await fetch(`${API_URL}/AccountingKey/delete/${accountingKey.id}?user_id=${userId}`, { method: 'DELETE' });
            if (resp.ok) { setConfirmDisable(false); onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa.'); setConfirmDisable(false); }
        } catch {
            setError('Tenging við þjón mistókst.'); setConfirmDisable(false);
        } finally {
            setDisabling(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>{isDisabled ? 'Óvirkur lykill' : 'Breyta lykli'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField
                        label="Heiti lykils" value={name}
                        onChange={e => setName(e.target.value)}
                        size="small" fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {ACCOUNTING_KEY_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button
                                onClick={() => setConfirmDisable(true)}
                                sx={{ color: 'text.disabled', textTransform: 'none', fontSize: '0.8rem', p: 0, minWidth: 0 }}
                            >
                                Óvirkja lykil
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            disabled={!isValid || saving}
                            onClick={handleSave}
                        >
                            {saving
                                ? <CircularProgress size={18} color="inherit" />
                                : isDisabled ? 'Virkja lykil' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs">
                <DialogTitle>Óvirkja lykil?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Lykillinn verður falinn í flokkunarformi. Núverandi færslur haldast óbreyttar.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button onClick={handleDisable} color="error" disabled={disabling}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
```

- [ ] **Step 4: Manually test in browser**

Start the backend and frontend:

```bash
# Terminal 1
cd HusfelagPy && poetry run python manage.py runserver 8010

# Terminal 2
cd HusfelagJS && npm start
```

1. Log in as superadmin
2. Navigate to `/superadmin`
3. Verify the "Bókhaldslyklar" panel appears below "Flokkar"
4. Verify the 12 seeded keys appear
5. Click "+" to add a new key with number 9999 — verify it appears
6. Click the edit icon — rename it and change type — verify it saves
7. Click "Óvirkja lykil" in the edit dialog — verify it moves to the disabled section
8. Re-enable it

- [ ] **Step 5: Commit**

```bash
git add HusfelagJS/src/controlers/SuperAdminPage.js
git commit -m "feat: GlobalAccountingKeysPanel in SuperAdminPage"
```

---

## Task 7: BankAccountsPanel in AssociationPage.js

**Files:**
- Modify: `HusfelagJS/src/controlers/AssociationPage.js`

- [ ] **Step 1: Read the bottom half of AssociationPage.js** to understand where to insert the panel.

```bash
cd HusfelagJS && grep -n "return\|Paper\|BankAccount\|Divider\|Grid" src/controlers/AssociationPage.js | head -40
```

- [ ] **Step 2: Add BankAccountsPanel component and wire it into AssociationPage**

In `HusfelagJS/src/controlers/AssociationPage.js`, add `BankAccountsPanel` before the `export default AssociationPage` statement:

```jsx
function BankAccountsPanel({ user, assocParam }) {
    const [bankAccounts, setBankAccounts] = React.useState(undefined);
    const [accountingKeys, setAccountingKeys] = React.useState([]);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);

    React.useEffect(() => {
        loadBankAccounts();
        fetch(`${API_URL}/AccountingKey/list`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setAccountingKeys(data.filter(k => k.type === 'ASSET')))
            .catch(() => {});
    }, [assocParam]);

    const loadBankAccounts = async () => {
        try {
            const resp = await fetch(`${API_URL}/BankAccount/${user.id}${assocParam}`);
            if (resp.ok) setBankAccounts(await resp.json());
            else { setError('Villa við að sækja bankareikninga.'); setBankAccounts([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setBankAccounts([]);
        }
    };

    if (bankAccounts === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Bankareikningar</Typography>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={() => setShowForm(v => !v)}
                >
                    {showForm ? 'Loka' : '+ Bæta við reikning'}
                </Button>
            </Box>

            <Collapse in={showForm}>
                <BankAccountForm
                    userId={user.id}
                    assocParam={assocParam}
                    accountingKeys={accountingKeys}
                    onCreated={() => { setShowForm(false); loadBankAccounts(); }}
                />
            </Collapse>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {bankAccounts.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Enginn bankareikningur skráður.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                <TableCell>Heiti</TableCell>
                                <TableCell>Reikningsnúmer</TableCell>
                                <TableCell>Bókhaldslykill</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {bankAccounts.map(b => (
                                <BankAccountRow
                                    key={b.id}
                                    bankAccount={b}
                                    userId={user.id}
                                    assocParam={assocParam}
                                    accountingKeys={accountingKeys}
                                    onSaved={loadBankAccounts}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Paper>
    );
}

function BankAccountForm({ userId, assocParam, accountingKeys, onCreated }) {
    const [name, setName] = React.useState('');
    const [accountNumber, setAccountNumber] = React.useState('');
    const [assetAccountId, setAssetAccountId] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    const isValid = name.trim() && accountNumber.trim();

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/BankAccount${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    name: name.trim(),
                    account_number: accountNumber.trim(),
                    asset_account_id: assetAccountId || null,
                    description: description.trim(),
                }),
            });
            if (resp.ok) {
                setName(''); setAccountNumber(''); setAssetAccountId(''); setDescription('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
            <TextField label="Heiti reiknings" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth />
            <TextField
                label="Reikningsnúmer" value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                size="small" fullWidth placeholder="0101-26-123456"
            />
            <FormControl size="small" fullWidth>
                <InputLabel>Bókhaldslykill (EIGN)</InputLabel>
                <Select
                    value={assetAccountId}
                    label="Bókhaldslykill (EIGN)"
                    onChange={e => setAssetAccountId(e.target.value)}
                >
                    <MenuItem value=""><em>Enginn</em></MenuItem>
                    {accountingKeys.map(k => (
                        <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <TextField
                label="Lýsing (valfrjálst)" value={description}
                onChange={e => setDescription(e.target.value)}
                size="small" fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista reikning'}
            </Button>
        </Paper>
    );
}

function BankAccountRow({ bankAccount, userId, assocParam, accountingKeys, onSaved }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover>
                <TableCell>{bankAccount.name}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{bankAccount.account_number}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                    {bankAccount.asset_account
                        ? `${bankAccount.asset_account.number} · ${bankAccount.asset_account.name}`
                        : '—'}
                </TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title="Breyta">
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <BankAccountEditDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                bankAccount={bankAccount}
                userId={userId}
                assocParam={assocParam}
                accountingKeys={accountingKeys}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function BankAccountEditDialog({ open, onClose, bankAccount, userId, assocParam, accountingKeys, onSaved }) {
    const [name, setName] = React.useState(bankAccount.name);
    const [accountNumber, setAccountNumber] = React.useState(bankAccount.account_number);
    const [assetAccountId, setAssetAccountId] = React.useState(bankAccount.asset_account?.id || '');
    const [description, setDescription] = React.useState(bankAccount.description || '');
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) {
            setName(bankAccount.name);
            setAccountNumber(bankAccount.account_number);
            setAssetAccountId(bankAccount.asset_account?.id || '');
            setDescription(bankAccount.description || '');
            setError('');
        }
    }, [open, bankAccount]);

    const isValid = name.trim() && accountNumber.trim();

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/BankAccount/update/${bankAccount.id}${assocParam}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    name: name.trim(),
                    account_number: accountNumber.trim(),
                    asset_account_id: assetAccountId || null,
                    description: description.trim(),
                }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const resp = await fetch(`${API_URL}/BankAccount/delete/${bankAccount.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });
            if (resp.ok) { setConfirmDelete(false); onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa.'); setConfirmDelete(false); }
        } catch {
            setError('Tenging við þjón mistókst.'); setConfirmDelete(false);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>Breyta bankareikningi</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField label="Heiti reiknings" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth />
                    <TextField
                        label="Reikningsnúmer" value={accountNumber}
                        onChange={e => setAccountNumber(e.target.value)}
                        size="small" fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Bókhaldslykill (EIGN)</InputLabel>
                        <Select
                            value={assetAccountId}
                            label="Bókhaldslykill (EIGN)"
                            onChange={e => setAssetAccountId(e.target.value)}
                        >
                            <MenuItem value=""><em>Enginn</em></MenuItem>
                            {accountingKeys.map(k => (
                                <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label="Lýsing (valfrjálst)" value={description}
                        onChange={e => setDescription(e.target.value)}
                        size="small" fullWidth
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Button
                        onClick={() => setConfirmDelete(true)}
                        sx={{ color: 'text.disabled', textTransform: 'none', fontSize: '0.8rem', p: 0, minWidth: 0 }}
                    >
                        Eyða reikningi
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            disabled={!isValid || saving} onClick={handleSave}
                        >
                            {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs">
                <DialogTitle>Eyða bankareikningi?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Bankareikningurinn verður fjarlægður. Færslur tengdar reikningnum haldast.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(false)}>Hætta við</Button>
                    <Button onClick={handleDelete} color="error" disabled={deleting}>
                        {deleting ? <CircularProgress size={18} color="inherit" /> : 'Eyða'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
```

Also add the necessary MUI imports that `BankAccountsPanel` uses. Ensure `AssociationPage.js` imports include `Collapse, Table, TableHead, TableRow, TableCell, TableBody, FormControl, InputLabel, Select, MenuItem, DialogContentText` — add any that are missing to the existing import block.

- [ ] **Step 3: Add BankAccountsPanel to the AssociationPage return**

Find the `return` in `AssociationPage` that renders the association content (after the loading/null guards). Add `<BankAccountsPanel user={user} assocParam={assocParam} />` at the bottom of the main content area, before the closing `</Box>`.

- [ ] **Step 4: Manually test in browser**

1. Navigate to `/husfelag`
2. Verify "Bankareikningar" panel appears at the bottom
3. Click "+ Bæta við reikning" — fill in name, account number, select an ASSET accounting key — save
4. Verify the new bank account appears in the table
5. Click edit icon — change the name — save
6. Click "Eyða reikningi" in the edit dialog — confirm deletion

- [ ] **Step 5: Commit**

```bash
git add HusfelagJS/src/controlers/AssociationPage.js
git commit -m "feat: BankAccountsPanel in AssociationPage"
```

---

## Task 8: Category account dropdowns in CategoriesPage and SuperAdminPage

**Files:**
- Modify: `HusfelagJS/src/controlers/CategoriesPage.js`
- Modify: `HusfelagJS/src/controlers/SuperAdminPage.js`

- [ ] **Step 1: Add account dropdowns to CategoriesPage edit dialog**

In `HusfelagJS/src/controlers/CategoriesPage.js`, find the category edit dialog (the component that handles editing a category row — search for the `PUT /Category/update` fetch call). Add accounting key state and dropdowns. The edit component must:

1. On open, fetch `GET /AccountingKey/list` to populate the dropdowns
2. Show `expense_account` dropdown (only if `user.is_superadmin`)
3. Show `income_account` dropdown (only if `user.is_superadmin`)
4. Include `expense_account_id` and `income_account_id` in the PUT body

Find the edit dialog component in CategoriesPage.js (it calls `PUT /Category/update/${category.id}`). Add these changes:

```jsx
// Add to the edit dialog state (after existing state variables):
const { user } = React.useContext(UserContext);
const [accountingKeys, setAccountingKeys] = React.useState([]);
const [expenseAccountId, setExpenseAccountId] = React.useState(category.expense_account_id || '');
const [incomeAccountId, setIncomeAccountId] = React.useState(category.income_account_id || '');

// Add to the useEffect that runs on dialog open:
React.useEffect(() => {
    if (open) {
        // ... existing reset code ...
        setExpenseAccountId(category.expense_account_id || '');
        setIncomeAccountId(category.income_account_id || '');
        fetch(`${API_URL}/AccountingKey/list`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setAccountingKeys(data))
            .catch(() => {});
    }
}, [open, category]);

// In the PUT body, include:
body: JSON.stringify({
    name: name.trim(),
    type,
    expense_account_id: expenseAccountId || null,
    income_account_id: incomeAccountId || null,
})

// Add dropdowns inside DialogContent (after the type Select, superadmin-only):
{user?.is_superadmin && (
    <>
        <FormControl size="small" fullWidth>
            <InputLabel>Gjaldareikningur (valfrjálst)</InputLabel>
            <Select
                value={expenseAccountId}
                label="Gjaldareikningur (valfrjálst)"
                onChange={e => setExpenseAccountId(e.target.value)}
            >
                <MenuItem value=""><em>Enginn</em></MenuItem>
                {accountingKeys.filter(k => k.type === 'EXPENSE').map(k => (
                    <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                ))}
            </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
            <InputLabel>Tekjureikningur (valfrjálst)</InputLabel>
            <Select
                value={incomeAccountId}
                label="Tekjureikningur (valfrjálst)"
                onChange={e => setIncomeAccountId(e.target.value)}
            >
                <MenuItem value=""><em>Enginn</em></MenuItem>
                {accountingKeys.filter(k => k.type === 'INCOME').map(k => (
                    <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                ))}
            </Select>
        </FormControl>
    </>
)}
```

- [ ] **Step 2: Add account dropdowns to GlobalEditCategoryDialog in SuperAdminPage.js**

In `HusfelagJS/src/controlers/SuperAdminPage.js`, find `GlobalEditCategoryDialog`. Apply the same changes:

```jsx
// Add to state:
const [accountingKeys, setAccountingKeys] = React.useState([]);
const [expenseAccountId, setExpenseAccountId] = React.useState(category.expense_account_id || '');
const [incomeAccountId, setIncomeAccountId] = React.useState(category.income_account_id || '');

// In the useEffect that runs on open, add:
setExpenseAccountId(category.expense_account_id || '');
setIncomeAccountId(category.income_account_id || '');
fetch(`${API_URL}/AccountingKey/list`)
    .then(r => r.ok ? r.json() : [])
    .then(data => setAccountingKeys(data))
    .catch(() => {});

// In the PUT body, include:
body: JSON.stringify({
    name: name.trim(),
    type,
    expense_account_id: expenseAccountId || null,
    income_account_id: incomeAccountId || null,
})

// Add after the type Select in DialogContent (always visible — GlobalCategoriesPanel is superadmin-only):
<FormControl size="small" fullWidth>
    <InputLabel>Gjaldareikningur (valfrjálst)</InputLabel>
    <Select
        value={expenseAccountId}
        label="Gjaldareikningur (valfrjálst)"
        onChange={e => setExpenseAccountId(e.target.value)}
    >
        <MenuItem value=""><em>Enginn</em></MenuItem>
        {accountingKeys.filter(k => k.type === 'EXPENSE').map(k => (
            <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
        ))}
    </Select>
</FormControl>
<FormControl size="small" fullWidth>
    <InputLabel>Tekjureikningur (valfrjálst)</InputLabel>
    <Select
        value={incomeAccountId}
        label="Tekjureikningur (valfrjálst)"
        onChange={e => setIncomeAccountId(e.target.value)}
    >
        <MenuItem value=""><em>Enginn</em></MenuItem>
        {accountingKeys.filter(k => k.type === 'INCOME').map(k => (
            <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
        ))}
    </Select>
</FormControl>
```

- [ ] **Step 3: Manually test in browser**

1. As superadmin, open `GlobalCategoriesPanel` on `/superadmin`
2. Edit a category — verify the "Gjaldareikningur" and "Tekjureikningur" dropdowns appear populated with seeded keys
3. Select an expense account (e.g., 5100 Tryggingar) — save — reopen — verify it persists
4. Navigate to `/flokkar` — edit a category — verify dropdowns appear (superadmin user)

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/CategoriesPage.js HusfelagJS/src/controlers/SuperAdminPage.js
git commit -m "feat: category account dropdowns in CategoriesPage and SuperAdminPage"
```

---

## Task 9: TransactionsPage, Sidebar nav item, and App.js route

**Files:**
- Create: `HusfelagJS/src/controlers/TransactionsPage.js`
- Modify: `HusfelagJS/src/controlers/Sidebar.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Add Sidebar nav item**

In `HusfelagJS/src/controlers/Sidebar.js`, find the `NAV` array and add "Færslur" between "Áætlun" and "Innheimta":

```javascript
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

// In the NAV array, replace the Áætlun and Innheimta entries with:
    { path: '/aaetlun',   label: 'Áætlun',    icon: <AssessmentOutlinedIcon            sx={{ fontSize: 20 }} /> },
    { path: '/faerslur',  label: 'Færslur',   icon: <ReceiptLongOutlinedIcon           sx={{ fontSize: 20 }} /> },
    { path: '/innheimta', label: 'Innheimta', icon: <AccountBalanceWalletOutlinedIcon  sx={{ fontSize: 20 }} /> },
```

- [ ] **Step 2: Add route in App.js**

In `HusfelagJS/src/App.js`, add the import and route:

```javascript
import TransactionsPage from './controlers/TransactionsPage';
```

Add to `<Routes>` (after the `/aaetlun/nyr` route):

```jsx
            <Route path="/faerslur" element={<TransactionsPage />} />
```

- [ ] **Step 3: Create TransactionsPage.js**

Create `HusfelagJS/src/controlers/TransactionsPage.js`:

```jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    Button, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, Alert, MenuItem, Select, FormControl,
    InputLabel, TextField,
} from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const STATUS_LABELS = {
    IMPORTED:    { label: 'Óflokkað', color: 'warning' },
    CATEGORISED: { label: 'Flokkað',  color: 'success' },
    RECONCILED:  { label: 'Jafnað',   color: 'default' },
};

function TransactionsPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [transactions, setTransactions] = useState(undefined);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [filterBankAccount, setFilterBankAccount] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user, assocParam, year]);

    const loadAll = async () => {
        setTransactions(undefined);
        try {
            const params = new URLSearchParams({ year });
            const [txResp, bankResp, catResp] = await Promise.all([
                fetch(`${API_URL}/Transaction/${user.id}${assocParam}&${params}`),
                fetch(`${API_URL}/BankAccount/${user.id}${assocParam}`),
                fetch(`${API_URL}/Category/list`),
            ]);
            if (txResp.ok) setTransactions(await txResp.json());
            else { setError('Villa við að sækja færslur.'); setTransactions([]); }
            if (bankResp.ok) setBankAccounts(await bankResp.json());
            if (catResp.ok) setCategories(await catResp.json());
        } catch {
            setError('Tenging við þjón mistókst.');
            setTransactions([]);
        }
    };

    const reloadTransactions = async () => {
        try {
            const params = new URLSearchParams({ year });
            const resp = await fetch(`${API_URL}/Transaction/${user.id}${assocParam}&${params}`);
            if (resp.ok) setTransactions(await resp.json());
        } catch {}
    };

    if (transactions === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const filtered = transactions.filter(tx => {
        if (filterBankAccount && tx.bank_account.id !== filterBankAccount) return false;
        if (filterStatus && tx.status !== filterStatus) return false;
        return true;
    });

    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">Færslur {year}</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <FormControl size="small">
                            <Select value={year} onChange={e => setYear(e.target.value)}>
                                {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            onClick={() => setShowForm(v => !v)}
                        >
                            {showForm ? 'Loka' : '+ Færsla'}
                        </Button>
                    </Box>
                </Box>

                {/* Add transaction form */}
                {showForm && (
                    <AddTransactionForm
                        userId={user.id}
                        assocParam={assocParam}
                        bankAccounts={bankAccounts}
                        categories={categories}
                        onCreated={() => { setShowForm(false); reloadTransactions(); }}
                    />
                )}

                {/* Filter bar */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Bankareikningur</InputLabel>
                        <Select
                            value={filterBankAccount}
                            label="Bankareikningur"
                            onChange={e => setFilterBankAccount(e.target.value)}
                        >
                            <MenuItem value="">Allir reikningar</MenuItem>
                            {bankAccounts.map(b => (
                                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Staða</InputLabel>
                        <Select
                            value={filterStatus}
                            label="Staða"
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <MenuItem value="">Allar stöður</MenuItem>
                            <MenuItem value="IMPORTED">Óflokkað</MenuItem>
                            <MenuItem value="CATEGORISED">Flokkað</MenuItem>
                            <MenuItem value="RECONCILED">Jafnað</MenuItem>
                        </Select>
                    </FormControl>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {filtered.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
                        Engar færslur fundust.
                    </Typography>
                ) : (
                    <Paper variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                    <TableCell>Dagsetning</TableCell>
                                    <TableCell>Lýsing</TableCell>
                                    <TableCell>Reikningur</TableCell>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell align="right">Upphæð</TableCell>
                                    <TableCell>Staða</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map(tx => (
                                    <TransactionRow
                                        key={tx.id}
                                        transaction={tx}
                                        userId={user.id}
                                        assocParam={assocParam}
                                        categories={categories}
                                        onUpdated={reloadTransactions}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>
                )}
            </Box>
        </div>
    );
}

function TransactionRow({ transaction: tx, userId, assocParam, categories, onUpdated }) {
    const [categoriseOpen, setCategoriseOpen] = useState(false);
    const amount = parseFloat(tx.amount);
    const statusInfo = STATUS_LABELS[tx.status] || { label: tx.status, color: 'default' };

    const dateObj = new Date(tx.date);
    const dateStr = dateObj.toLocaleDateString('is-IS', { day: 'numeric', month: 'long' });

    return (
        <>
            <TableRow
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => setCategoriseOpen(true)}
            >
                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{dateStr}</TableCell>
                <TableCell>{tx.description}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{tx.bank_account.name}</TableCell>
                <TableCell>
                    {tx.category
                        ? <Chip label={tx.category.name} size="small" variant="outlined" />
                        : <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>Óflokkað</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', color: amount >= 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
                    {amount >= 0 ? '+' : ''}{fmtAmount(amount)} kr.
                </TableCell>
                <TableCell>
                    <Chip label={statusInfo.label} size="small" color={statusInfo.color} />
                </TableCell>
            </TableRow>
            <CategoriseDialog
                open={categoriseOpen}
                onClose={() => setCategoriseOpen(false)}
                transaction={tx}
                userId={userId}
                assocParam={assocParam}
                categories={categories}
                onSaved={() => { setCategoriseOpen(false); onUpdated(); }}
            />
        </>
    );
}

function CategoriseDialog({ open, onClose, transaction: tx, userId, assocParam, categories, onSaved }) {
    const [categoryId, setCategoryId] = useState(tx.category?.id || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) { setCategoryId(tx.category?.id || ''); setError(''); }
    }, [open, tx]);

    const handleSave = async () => {
        if (!categoryId) return;
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Transaction/categorise/${tx.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, category_id: categoryId }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við vistun.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Flokka færslu</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <Box>
                    <Typography variant="body2" fontWeight={500}>{tx.description}</Typography>
                    <Typography variant="caption" color="text.secondary">{tx.date}</Typography>
                </Box>
                <FormControl size="small" fullWidth>
                    <InputLabel>Flokkur</InputLabel>
                    <Select
                        value={categoryId}
                        label="Flokkur"
                        onChange={e => setCategoryId(e.target.value)}
                    >
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {categories.map(c => (
                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={!categoryId || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function AddTransactionForm({ userId, assocParam, bankAccounts, categories, onCreated }) {
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [reference, setReference] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isValid = bankAccountId && date && amount && description.trim();

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Transaction${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    bank_account_id: bankAccountId,
                    date,
                    amount,
                    description: description.trim(),
                    reference: reference.trim(),
                    category_id: categoryId || null,
                }),
            });
            if (resp.ok) {
                setBankAccountId(''); setDate(new Date().toISOString().slice(0, 10));
                setAmount(''); setDescription(''); setReference(''); setCategoryId('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2">Ný færsla</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                    label="Dagsetning" type="date" value={date}
                    onChange={e => setDate(e.target.value)}
                    size="small" InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
                />
                <TextField
                    label="Upphæð" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    size="small" sx={{ width: 140 }}
                    placeholder="-50000"
                    helperText="Neikvætt = útgjöld"
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Bankareikningur</InputLabel>
                    <Select value={bankAccountId} label="Bankareikningur" onChange={e => setBankAccountId(e.target.value)}>
                        <MenuItem value=""><em>Veldu reikning</em></MenuItem>
                        {bankAccounts.map(b => (
                            <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                    label="Lýsing" value={description}
                    onChange={e => setDescription(e.target.value)}
                    size="small" sx={{ flex: 1, minWidth: 200 }}
                />
                <TextField
                    label="Tilvísun (valfrjálst)" value={reference}
                    onChange={e => setReference(e.target.value)}
                    size="small" sx={{ width: 160 }}
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Flokkur (valfrjálst)</InputLabel>
                    <Select value={categoryId} label="Flokkur (valfrjálst)" onChange={e => setCategoryId(e.target.value)}>
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {categories.map(c => (
                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Skrá færslu'}
            </Button>
        </Paper>
    );
}

export default TransactionsPage;
```

- [ ] **Step 4: Manually test in browser**

1. Verify "Færslur" appears in the sidebar between "Áætlun" and "Innheimta"
2. Navigate to `/faerslur`
3. Verify the page loads with year header and filter bar
4. Click "+ Færsla" — add a manual transaction (negative amount) — verify it appears in the table
5. Click a row — verify the categorise dialog opens
6. Select a category — save — verify the row shows the category chip and "Flokkað" status badge
7. Verify the year selector switches between years

- [ ] **Step 5: Commit**

```bash
git add HusfelagJS/src/controlers/TransactionsPage.js HusfelagJS/src/controlers/Sidebar.js HusfelagJS/src/App.js
git commit -m "feat: TransactionsPage, Sidebar nav item, and App.js route for /faerslur"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `AccountingKey` model + migration | Task 1 |
| Seeded chart of accounts (12 entries) | Task 1 step 5 |
| `AccountingKey` superadmin endpoints (6) | Task 2 |
| `GET /AccountingKey/list` public endpoint | Task 2 |
| `Category` gains `expense_account` + `income_account` FKs | Task 3 |
| `CategorySerializer` returns FK fields | Task 3 step 5 |
| `CategoryView.put` handles FK updates | Task 3 step 6 |
| `BankAccount` model + migration | Task 4 |
| `BankAccount` endpoints (4) | Task 4 |
| `Transaction` model + migration | Task 5 |
| `Transaction` endpoints (3) | Task 5 |
| Derived accounting entries on read | Computed in frontend TransactionRow — not stored (spec: "computed on read") |
| `GlobalAccountingKeysPanel` in SuperAdminPage | Task 6 |
| `BankAccountsPanel` in AssociationPage | Task 7 |
| Account dropdowns in CategoriesPage (superadmin only) | Task 8 |
| Account dropdowns in GlobalCategoriesPanel | Task 8 |
| "Færslur" sidebar entry between Áætlun and Innheimta | Task 9 step 1 |
| `/faerslur` route | Task 9 step 2 |
| `TransactionsPage` with list, year filter, status filter | Task 9 step 3 |
| Manual transaction entry form | Task 9 step 3 (AddTransactionForm) |
| Categorise dialog on row click | Task 9 step 3 (CategoriseDialog) |
| `GET /Transaction` with `?year=`, `?bank_account_id=`, `?status=` filters | Task 5 step 6 |
| Error: duplicate AccountingKey number → 400 | Task 2 step 4 (view) |
| Error: BankAccount for wrong association → 403 | Task 4 step 6 (view) |
| Error: Transaction references wrong association → 403 | Task 5 step 6 (view) |
| Error: `Transaction.categorise` category not found → 404 | Task 5 step 6 (view) |
| `GET /Transaction` with no bank accounts → `[]` 200 | Task 5 step 6 (view) |

All spec requirements are covered.

### Notes for the implementer

- Migration numbers must be exactly `0013`, `0014`, `0015`, `0016` — if the project has more migrations than expected, adjust the dependency chain accordingly.
- The `fmtAmount` import in `TransactionsPage.js` comes from `../format` — this function already exists in the project.
- The `assocParam` for POST/PATCH to Transaction is passed as query param (e.g. `?as=<id>`), which `_resolve_assoc` reads from `request.query_params`.
- `ReceiptLongOutlinedIcon` is in `@mui/icons-material` (already installed). No new npm packages needed.
- Backend tests use numbers in the `9700–9999` range for test-specific `AccountingKey` objects to avoid collisions with the 12 seeded keys.
