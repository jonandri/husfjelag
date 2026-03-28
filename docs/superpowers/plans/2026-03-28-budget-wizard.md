# Budget Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-click budget create button with a guided 3-step wizard at `/aaetlun/nyr`, and move category management from per-association to a global superadmin-only list.

**Architecture:** Backend: make `Category` global (remove `association` FK), add `GET /Category/list` and `POST /Budget/wizard` endpoints, guard Category writes to superadmin only. Frontend: new `BudgetWizardPage` at `/aaetlun/nyr`, global categories panel in `SuperAdminPage`, remove "Flokkar" from sidebar.

**Tech Stack:** Django 4.1 / DRF, React 17, MUI v5. Tests via `python manage.py test associations` (Django TestCase + Client). Run backend from `HusfelagPy/` with `poetry run python manage.py <cmd>`.

---

## File Map

| File | Change |
|---|---|
| `HusfelagPy/associations/models.py` | Remove `association` FK from `Category` |
| `HusfelagPy/associations/migrations/0012_category_global.py` | Clean-slate migration: delete BudgetItems + Categories, drop FK |
| `HusfelagPy/associations/views.py` | Update `CategoryView`, add `CategoryListView` + `BudgetWizardView`, remove dead code |
| `HusfelagPy/associations/urls.py` | Add `Category/list` and `Budget/wizard` routes |
| `HusfelagPy/associations/tests.py` | Add tests for new/changed endpoints |
| `HusfelagJS/src/controlers/Sidebar.js` | Remove "Flokkar" from `NAV` array |
| `HusfelagJS/src/controlers/BudgetPage.js` | Replace POST create with `navigate('/aaetlun/nyr')` |
| `HusfelagJS/src/App.js` | Add route `/aaetlun/nyr` → `BudgetWizardPage` |
| `HusfelagJS/src/controlers/BudgetWizardPage.js` | New file — 3-step wizard |
| `HusfelagJS/src/controlers/SuperAdminPage.js` | Add `GlobalCategoriesPanel` |

---

## Task 1: Backend — Make Category global (model + migration)

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: `HusfelagPy/associations/migrations/0012_category_global.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing test**

In `HusfelagPy/associations/tests.py`, add at the end of the file:

```python
class CategoryGlobalModelTest(TestCase):
    def test_category_has_no_association_field(self):
        """Category can be created without an association."""
        from associations.models import Category
        cat = Category.objects.create(name="Tryggingar", type="SHARED")
        self.assertEqual(cat.name, "Tryggingar")
        self.assertFalse(hasattr(cat, 'association_id'))

    def test_two_categories_same_name_allowed(self):
        """Without unique_together, duplicate names across old associations are fine."""
        from associations.models import Category
        Category.objects.create(name="Hiti", type="SHARE2")
        Category.objects.create(name="Hiti", type="SHARE2")  # should not raise
        self.assertEqual(Category.objects.filter(name="Hiti").count(), 2)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryGlobalModelTest -v 2
```

Expected: FAIL — `Category() got an unexpected keyword argument 'association'` or `TypeError` because association is required.

- [ ] **Step 3: Update `Category` model in `models.py`**

In `HusfelagPy/associations/models.py`, replace the `Category` class:

```python
class Category(models.Model):
    # association FK removed — categories are global, managed by superadmin
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=CategoryType.choices)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_category"

    def __str__(self):
        return f"{self.name} ({self.type})"
```

- [ ] **Step 4: Create migration `0012_category_global.py`**

Create `HusfelagPy/associations/migrations/0012_category_global.py`:

```python
from django.db import migrations


def delete_all_category_data(apps, schema_editor):
    """Clean slate: delete BudgetItems (reference Category via FK PROTECT) then Categories."""
    BudgetItem = apps.get_model("associations", "BudgetItem")
    Category = apps.get_model("associations", "Category")
    BudgetItem.objects.all().delete()
    Category.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("associations", "0011_hmsimportsource_landeign_stadfang"),
    ]

    operations = [
        migrations.RunPython(delete_all_category_data, migrations.RunPython.noop),
        migrations.RemoveField(model_name="category", name="association"),
    ]
```

- [ ] **Step 5: Apply the migration**

```bash
cd HusfelagPy && poetry run python manage.py migrate associations
```

Expected: `Applying associations.0012_category_global... OK`

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryGlobalModelTest -v 2
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/models.py HusfelagPy/associations/migrations/0012_category_global.py HusfelagPy/associations/tests.py
git commit -m "feat: make Category global — remove association FK, clean-slate migration"
```

---

## Task 2: Backend — Update Category endpoints + add CategoryListView

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
class CategoryListViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        from associations.models import Category
        Category.objects.create(name="Tryggingar", type="SHARED")
        Category.objects.create(name="Hiti", type="SHARE2")
        Category.objects.create(name="Óvirkur", type="EQUAL", deleted=True)

    def test_list_returns_only_active_categories(self):
        resp = self.client.get("/Category/list")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        names = {c["name"] for c in data}
        self.assertIn("Tryggingar", names)
        self.assertIn("Hiti", names)
        self.assertNotIn("Óvirkur", names)

    def test_list_returns_id_name_type(self):
        resp = self.client.get("/Category/list")
        item = resp.json()[0]
        self.assertIn("id", item)
        self.assertIn("name", item)
        self.assertIn("type", item)


class CategorySuperadminGuardTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.superadmin = User.objects.create(kennitala="0000000001", name="Super", is_superadmin=True)
        self.regular = User.objects.create(kennitala="0000000002", name="Regular", is_superadmin=False)

    def test_post_category_requires_superadmin(self):
        resp = self.client.post(
            "/Category",
            data=json.dumps({"user_id": self.regular.id, "name": "Test", "type": "SHARED"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_post_category_succeeds_for_superadmin(self):
        resp = self.client.post(
            "/Category",
            data=json.dumps({"user_id": self.superadmin.id, "name": "Tryggingar", "type": "SHARED"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["name"], "Tryggingar")

    def test_put_category_requires_superadmin(self):
        from associations.models import Category
        cat = Category.objects.create(name="Old", type="SHARED")
        resp = self.client.put(
            f"/Category/update/{cat.id}?user_id={self.regular.id}",
            data=json.dumps({"name": "New", "type": "SHARED"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_delete_category_requires_superadmin(self):
        from associations.models import Category
        cat = Category.objects.create(name="ToDelete", type="EQUAL")
        resp = self.client.delete(f"/Category/delete/{cat.id}?user_id={self.regular.id}")
        self.assertEqual(resp.status_code, 403)
        cat.refresh_from_db()
        self.assertFalse(cat.deleted)

    def test_enable_category_requires_superadmin(self):
        from associations.models import Category
        cat = Category.objects.create(name="Disabled", type="EQUAL", deleted=True)
        resp = self.client.patch(f"/Category/enable/{cat.id}?user_id={self.regular.id}")
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryListViewTest associations.tests.CategorySuperadminGuardTest -v 2
```

Expected: multiple FAILs (404 on Category/list, no 403 on write endpoints).

- [ ] **Step 3: Update `CategoryView` and add `CategoryListView` in `views.py`**

In `HusfelagPy/associations/views.py`, make these changes:

**a) Add `CategoryListView` class** (place it just before `CategoryView`):

```python
class CategoryListView(APIView):
    def get(self, request):
        """GET /Category/list — all active global categories, no scoping."""
        categories = Category.objects.filter(deleted=False).order_by("name")
        return Response(CategorySerializer(categories, many=True).data)
```

**b) Replace the entire `CategoryView` class** with:

```python
class CategoryView(APIView):
    def _require_superadmin(self, user_id):
        """Returns (user, error_response). error_response is None if user is superadmin."""
        try:
            user = User.objects.get(id=user_id)
        except (User.DoesNotExist, TypeError, ValueError):
            return None, Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if not user.is_superadmin:
            return None, Response({"detail": "Aðeins kerfisstjórar geta breytt flokkum."}, status=status.HTTP_403_FORBIDDEN)
        return user, None

    def get(self, request, user_id):
        """GET /Category/{user_id} — all global categories (active + deleted) for superadmin panel."""
        categories = Category.objects.all().order_by("name")
        return Response(CategorySerializer(categories, many=True).data)

    def post(self, request):
        """POST /Category — create a global category. Superadmin only."""
        user_id = request.data.get("user_id")
        name = request.data.get("name", "").strip()
        type_ = request.data.get("type", "")

        if not name or not type_:
            return Response({"detail": "name og type eru nauðsynleg."}, status=status.HTTP_400_BAD_REQUEST)

        _, err = self._require_superadmin(user_id)
        if err:
            return err

        category = Category.objects.create(name=name, type=type_)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)

    def put(self, request, category_id):
        """PUT /Category/update/{id}?user_id=X — update name/type. Superadmin only."""
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
        category.save(update_fields=["name", "type"])
        return Response(CategorySerializer(category).data)

    def delete(self, request, category_id):
        """DELETE /Category/delete/{id}?user_id=X — soft-delete. Superadmin only."""
        user_id = request.query_params.get("user_id")
        _, err = self._require_superadmin(user_id)
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
        """PATCH /Category/enable/{id}?user_id=X — re-enable. Superadmin only."""
        user_id = request.query_params.get("user_id")
        _, err = self._require_superadmin(user_id)
        if err:
            return err

        try:
            category = Category.objects.get(id=category_id, deleted=True)
        except Category.DoesNotExist:
            return Response({"detail": "Flokkur fannst ekki."}, status=status.HTTP_404_NOT_FOUND)
        category.deleted = False
        category.save(update_fields=["deleted"])
        return Response(CategorySerializer(category).data)
```

- [ ] **Step 4: Update `urls.py` to add `Category/list` route and import `CategoryListView`**

In `HusfelagPy/associations/urls.py`, update the import and add the route:

```python
from django.urls import path
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    BudgetView, BudgetItemView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)

urlpatterns = [
    path("Apartment/import/sources", ApartmentImportSourcesView.as_view(), name="apartment-import-sources"),
    path("Apartment/import/preview", ApartmentImportPreviewView.as_view(), name="apartment-import-preview"),
    path("Apartment/import/confirm", ApartmentImportConfirmView.as_view(), name="apartment-import-confirm"),
    path("Association/lookup", AssociationLookupView.as_view(), name="association-lookup"),
    path("Association/list/<int:user_id>", AssociationListView.as_view(), name="association-list"),
    path("Association/<int:user_id>", AssociationView.as_view(), name="association-detail"),
    path("Association", AssociationView.as_view(), name="association-create"),
    path("Association/roles/<int:user_id>", AssociationRoleView.as_view(), name="association-roles"),
    path("admin/Association", AdminAssociationView.as_view(), name="admin-association"),
    path("Apartment/<int:user_id>", ApartmentView.as_view(), name="apartment-list"),
    path("Apartment", ApartmentView.as_view(), name="apartment-create"),
    path("Apartment/update/<int:apartment_id>", ApartmentView.as_view(), name="apartment-update"),
    path("Apartment/delete/<int:apartment_id>", ApartmentView.as_view(), name="apartment-delete"),
    path("Apartment/enable/<int:apartment_id>", ApartmentView.as_view(), name="apartment-enable"),
    path("Apartment/<int:apartment_id>/owner/<int:owner_id>", ApartmentOwnerView.as_view(), name="apartment-owner-delete"),
    path("Apartment/<int:apartment_id>/owner", ApartmentOwnerView.as_view(), name="apartment-owner-create"),
    path("Owner/<int:user_id>", OwnerView.as_view(), name="owner-list"),
    path("Owner", OwnerView.as_view(), name="owner-create"),
    path("Owner/update/<int:ownership_id>", OwnerView.as_view(), name="owner-update"),
    path("Owner/delete/<int:ownership_id>", OwnerView.as_view(), name="owner-delete"),
    path("Owner/enable/<int:ownership_id>", OwnerView.as_view(), name="owner-enable"),
    path("Category/list", CategoryListView.as_view(), name="category-list-global"),
    path("Category/<int:user_id>", CategoryView.as_view(), name="category-list"),
    path("Category", CategoryView.as_view(), name="category-create"),
    path("Category/update/<int:category_id>", CategoryView.as_view(), name="category-update"),
    path("Category/delete/<int:category_id>", CategoryView.as_view(), name="category-delete"),
    path("Category/enable/<int:category_id>", CategoryView.as_view(), name="category-enable"),
    path("Budget/<int:user_id>", BudgetView.as_view(), name="budget-get"),
    path("Budget", BudgetView.as_view(), name="budget-create"),
    path("BudgetItem/update/<int:item_id>", BudgetItemView.as_view(), name="budgetitem-update"),
    path("Collection/<int:user_id>", CollectionView.as_view(), name="collection-list"),
]
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.CategoryListViewTest associations.tests.CategorySuperadminGuardTest -v 2
```

Expected: 7 tests PASS.

- [ ] **Step 6: Run the full test suite to ensure no regressions**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git commit -m "feat: global category endpoints — CategoryListView, superadmin guard on writes"
```

---

## Task 3: Backend — POST /Budget/wizard + remove dead code

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write failing tests for `BudgetWizardView`**

Add to `HusfelagPy/associations/tests.py`:

```python
class BudgetWizardViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="9999999901", name="Wizard User")
        self.association = Association.objects.create(
            ssn="9999999902", name="Wizard Húsfélag",
            address="Wizardgata 1", postal_code="600", city="Akureyri"
        )
        from associations.models import AssociationAccess, AssociationRole, Category
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role=AssociationRole.CHAIR, active=True
        )
        self.cat1 = Category.objects.create(name="Tryggingar", type="SHARED")
        self.cat2 = Category.objects.create(name="Hiti", type="SHARE2")

    def test_wizard_creates_budget_with_items(self):
        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": self.user.id,
                "items": [
                    {"category_id": self.cat1.id, "amount": 450000},
                    {"category_id": self.cat2.id, "amount": 120000},
                ]
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["is_active"], True)
        self.assertEqual(data["version"], 1)
        self.assertEqual(len(data["items"]), 2)
        amounts = {i["category_id"]: float(i["amount"]) for i in data["items"]}
        self.assertAlmostEqual(amounts[self.cat1.id], 450000)
        self.assertAlmostEqual(amounts[self.cat2.id], 120000)

    def test_wizard_deactivates_previous_budget(self):
        from associations.models import Budget
        old = Budget.objects.create(
            association=self.association, year=2025, version=1, is_active=True
        )
        import datetime
        year = datetime.date.today().year
        # Patch year to match old budget for test
        old.year = year
        old.save()

        self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": self.user.id,
                "items": [{"category_id": self.cat1.id, "amount": 100}],
            }),
            content_type="application/json",
        )
        old.refresh_from_db()
        self.assertFalse(old.is_active)

    def test_wizard_increments_version(self):
        from associations.models import Budget
        import datetime
        year = datetime.date.today().year
        Budget.objects.create(association=self.association, year=year, version=1, is_active=True)

        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": self.user.id,
                "items": [{"category_id": self.cat1.id, "amount": 1}],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["version"], 2)

    def test_wizard_returns_400_for_empty_items(self):
        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({"user_id": self.user.id, "items": []}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_wizard_returns_400_for_invalid_category(self):
        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": self.user.id,
                "items": [{"category_id": 99999, "amount": 100}],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_wizard_returns_404_for_unknown_user(self):
        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": 99999,
                "items": [{"category_id": self.cat1.id, "amount": 100}],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.BudgetWizardViewTest -v 2
```

Expected: all FAIL (no `Budget/wizard` route yet).

- [ ] **Step 3: Add `BudgetWizardView` and remove dead code in `views.py`**

In `HusfelagPy/associations/views.py`:

**a) Remove** the `_create_default_categories` function (lines approx 40–60):

Delete this entire function:
```python
def _create_default_categories(association):
    ...
```

**b) Remove** the call to `_create_default_categories` inside `AssociationView.post`. Find the line:
```python
        _create_default_categories(association)
```
and delete it.

**c) Remove** `_create_budget_items` function (approx lines 621–644):

Delete this entire function:
```python
def _create_budget_items(budget, source_budget=None):
    ...
```

**d) Remove** `BudgetView.post` method (the old one-click create endpoint). The `BudgetView` class should only keep the `get` method. Delete:

```python
    def post(self, request):
        """
        POST /Budget — Create a new budget version for the current year.
        ...
        """
        ...
```

**e) Update `BudgetView.get`** — the current GET auto-creates a budget if none exists. Remove the auto-create logic so it returns `null` when no budget exists (the wizard handles creation now):

Replace the `get` method with:

```python
    def get(self, request, user_id):
        """GET /Budget/{user_id} — Return the active budget for the current year, or null if none."""
        association = self._get_association(user_id, request)
        if not association:
            return Response(None, status=status.HTTP_200_OK)

        year = datetime.date.today().year
        budget = Budget.objects.filter(
            association=association, year=year, is_active=True
        ).prefetch_related("items__category").first()

        if not budget:
            return Response(None, status=status.HTTP_200_OK)

        return Response(BudgetSerializer(budget).data)
```

**f) Add `BudgetWizardView` class** after `BudgetItemView`:

```python
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
        if not items_data:
            return Response({"detail": "items cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

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

        return Response(
            BudgetSerializer(_budget_with_items(new_budget)).data,
            status=status.HTTP_201_CREATED,
        )
```

- [ ] **Step 4: Update `urls.py`** — add `Budget/wizard` route, import `BudgetWizardView`, remove `Budget` POST route

In `HusfelagPy/associations/urls.py`, update the import line and replace the `Budget` routes:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Replace the budget routes section in `urlpatterns` with:

```python
    path("Budget/<int:user_id>", BudgetView.as_view(), name="budget-get"),
    path("Budget/wizard", BudgetWizardView.as_view(), name="budget-wizard"),
    path("BudgetItem/update/<int:item_id>", BudgetItemView.as_view(), name="budgetitem-update"),
```

(Remove `path("Budget", BudgetView.as_view(), name="budget-create")`)

- [ ] **Step 5: Run wizard tests**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.BudgetWizardViewTest -v 2
```

Expected: all 6 PASS.

- [ ] **Step 6: Run full test suite**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git commit -m "feat: POST /Budget/wizard endpoint, remove dead budget create + category defaults code"
```

---

## Task 4: Frontend — Sidebar + BudgetPage entry point

**Files:**
- Modify: `HusfelagJS/src/controlers/Sidebar.js`
- Modify: `HusfelagJS/src/controlers/BudgetPage.js`

- [ ] **Step 1: Remove "Flokkar" from `Sidebar.js` NAV array**

In `HusfelagJS/src/controlers/Sidebar.js`, find the `NAV` constant (around line 32) and remove the Flokkar entry:

```javascript
const NAV = [
    { path: '/husfelag',  label: 'Húsfélag',  icon: <BusinessOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/ibudir',    label: 'Íbúðir',    icon: <HomeOutlinedIcon                  sx={{ fontSize: 20 }} /> },
    { path: '/eigendur',  label: 'Eigendur',  icon: <GroupOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/aaetlun',   label: 'Áætlun',    icon: <AssessmentOutlinedIcon            sx={{ fontSize: 20 }} /> },
    { path: '/innheimta', label: 'Innheimta', icon: <AccountBalanceWalletOutlinedIcon  sx={{ fontSize: 20 }} /> },
];
```

Also remove the now-unused `LabelOutlinedIcon` import from the MUI icons imports at the top of the file:

Remove: `import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';`

- [ ] **Step 2: Update `BudgetPage.js` — replace create button with wizard navigation**

In `HusfelagJS/src/controlers/BudgetPage.js`:

**a)** Remove the `creating` state (line ~29): `const [creating, setCreating] = useState(false);`

**b)** Replace the entire `handleCreate` function (lines ~50–66):

```javascript
    const handleCreate = () => navigate('/aaetlun/nyr');
```

**c)** Update the Button that calls `handleCreate` (around line 93–98). Replace:

```jsx
                    <Button
                        variant="contained" color="secondary" sx={{ color: '#fff' }}
                        disabled={creating} onClick={handleCreate}
                    >
                        {creating ? <CircularProgress size={20} color="inherit" /> : `+ Búa til nýja áætlun ${year}`}
                    </Button>
```

With:

```jsx
                    <Button
                        variant="contained" color="secondary" sx={{ color: '#fff' }}
                        onClick={handleCreate}
                    >
                        + Búa til nýja áætlun {year}
                    </Button>
```

**d)** Remove `CircularProgress` from the import at the top if it is no longer used by anything else in the file. Check: `EditAmountDialog` still uses `CircularProgress` (line ~231). Keep it.

**e)** Also update the empty-items message (line ~104) to remove the reference to "Flokkar" page since the route is hidden:

```jsx
                ) : budget.items.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4 }}>
                        Áætlun er til en engir flokkar eru skráðir.
                    </Typography>
```

- [ ] **Step 3: Verify imports still used**

In `BudgetPage.js`, verify `useNavigate` is imported (it is, line 2). The `creating` state removal means you can also remove the `setCreating` import — but `useState` is still used for `budget`, `error`. Nothing else to clean up.

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/Sidebar.js HusfelagJS/src/controlers/BudgetPage.js
git commit -m "feat: remove Flokkar from sidebar, budget create button navigates to wizard"
```

---

## Task 5: Frontend — BudgetWizardPage + App.js route

**Files:**
- Create: `HusfelagJS/src/controlers/BudgetWizardPage.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Create `BudgetWizardPage.js`**

Create `HusfelagJS/src/controlers/BudgetWizardPage.js`:

```javascript
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Button, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    TextField, Alert,
} from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const TYPE_META = {
    SHARED: { label: 'Sameiginlegt', color: '#08C076' },
    SHARE2: { label: 'Hiti',         color: '#7dd3d3' },
    SHARE3: { label: 'Lóð',          color: '#ffaa00' },
    EQUAL:  { label: 'Jafnskipt',    color: '#cc88ff' },
};

function BudgetWizardPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [categories, setCategories] = useState([]);
    const [previousBudget, setPreviousBudget] = useState(null);
    const [hasPrevious, setHasPrevious] = useState(false);
    const [amounts, setAmounts] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const year = new Date().getFullYear();

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        Promise.all([
            fetch(`${API_URL}/Category/list`).then(r => r.ok ? r.json() : Promise.reject('categories')),
            fetch(`${API_URL}/Budget/${user.id}${assocParam}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]).then(([cats, budget]) => {
            setCategories(cats);
            if (budget && budget.items && budget.items.length > 0) {
                setPreviousBudget(budget);
                setHasPrevious(true);
            }
            const init = {};
            cats.forEach(c => { init[c.id] = 0; });
            setAmounts(init);
            setLoading(false);
        }).catch(() => {
            setError('Villa við að sækja flokka. Reyndu aftur.');
            setLoading(false);
        });
    }, [user, assocParam]);

    const handleCopyPrevious = () => {
        const filled = {};
        categories.forEach(c => { filled[c.id] = 0; });
        if (previousBudget) {
            previousBudget.items.forEach(item => {
                filled[item.category_id] = Math.round(parseFloat(item.amount || 0));
            });
        }
        setAmounts(filled);
        setStep(2);
    };

    const handleStartFresh = () => {
        const blank = {};
        categories.forEach(c => { blank[c.id] = 0; });
        setAmounts(blank);
        setStep(2);
    };

    const totals = React.useMemo(() => {
        const t = { SHARED: 0, SHARE2: 0, SHARE3: 0, EQUAL: 0 };
        categories.forEach(c => {
            if (t[c.type] !== undefined) t[c.type] += (parseInt(amounts[c.id]) || 0);
        });
        return t;
    }, [amounts, categories]);

    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

    const handleConfirm = async () => {
        setSubmitError('');
        setSubmitting(true);
        const items = categories
            .map(c => ({ category_id: c.id, amount: parseInt(amounts[c.id]) || 0 }))
            .filter(i => i.amount > 0);
        try {
            const resp = await fetch(`${API_URL}/Budget/wizard${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, items }),
            });
            if (resp.ok) {
                navigate('/aaetlun');
            } else {
                const data = await resp.json();
                setSubmitError(data.detail || 'Villa við að vista áætlun. Reyndu aftur.');
            }
        } catch {
            setSubmitError('Villa við að vista áætlun. Reyndu aftur.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                <Box sx={{ mb: 3 }}>
                    <Button
                        size="small" variant="text" color="inherit"
                        sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0 }}
                        onClick={() => navigate('/aaetlun')}
                    >
                        ← Áætlun
                    </Button>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {step === 1 && (
                    <Step1
                        year={year}
                        hasPrevious={hasPrevious}
                        previousBudget={previousBudget}
                        onCopy={handleCopyPrevious}
                        onFresh={handleStartFresh}
                    />
                )}
                {step === 2 && (
                    <Step2
                        hasPrevious={hasPrevious}
                        categories={categories}
                        amounts={amounts}
                        setAmounts={setAmounts}
                        totals={totals}
                        grandTotal={grandTotal}
                        onBack={() => hasPrevious ? setStep(1) : navigate('/aaetlun')}
                        onNext={() => setStep(3)}
                    />
                )}
                {step === 3 && (
                    <Step3
                        year={year}
                        totals={totals}
                        grandTotal={grandTotal}
                        categories={categories}
                        submitting={submitting}
                        error={submitError}
                        onBack={() => setStep(2)}
                        onConfirm={handleConfirm}
                    />
                )}
            </Box>
        </div>
    );
}

function Step1({ year, hasPrevious, previousBudget, onCopy, onFresh }) {
    return (
        <Box sx={{ maxWidth: 480 }}>
            <Typography variant="caption" color="text.secondary">
                {hasPrevious ? 'Skref 1 af 3' : ''}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5, mb: 2 }}>Ný áætlun {year}</Typography>
            {hasPrevious ? (
                <>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        Viltu nota fyrri áætlun sem grunn?
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2, cursor: 'pointer',
                                borderColor: 'secondary.main',
                                '&:hover': { bgcolor: 'rgba(8,192,118,0.05)' },
                            }}
                            onClick={onCopy}
                        >
                            <Typography fontWeight={500} color="secondary.main">
                                ↩ Afrita frá áætlun {previousBudget?.year}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Byrja með sömu upphæðir og í fyrra — breyta þar sem þarf
                            </Typography>
                        </Paper>
                        <Paper
                            variant="outlined"
                            sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' } }}
                            onClick={onFresh}
                        >
                            <Typography fontWeight={500}>✦ Byrja frá grunni</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Slá inn allar upphæðir af nýju
                            </Typography>
                        </Paper>
                    </Box>
                </>
            ) : (
                <>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Engin fyrri áætlun er til. Slærðu inn upphæðir fyrir hvern flokk á næsta skrefi.
                    </Typography>
                    <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={onFresh}>
                        Áfram →
                    </Button>
                </>
            )}
        </Box>
    );
}

function Step2({ hasPrevious, categories, amounts, setAmounts, totals, grandTotal, onBack, onNext }) {
    const stepLabel = hasPrevious ? 'Skref 2 af 3' : 'Skref 1 af 2';
    return (
        <Box sx={{ maxWidth: 680 }}>
            <Typography variant="caption" color="text.secondary">{stepLabel}</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, mb: 3 }}>Upphæðir per flokk</Typography>

            {categories.length === 0 ? (
                <Alert severity="info">
                    Engir flokkar eru skilgreindir. Kerfisstjóri þarf að bæta við flokki.
                </Alert>
            ) : (
                <>
                    <Paper variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell>Tegund</TableCell>
                                    <TableCell align="right">Upphæð á ári (kr.)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {categories.map(c => (
                                    <TableRow key={c.id}>
                                        <TableCell>{c.name}</TableCell>
                                        <TableCell sx={{ color: TYPE_META[c.type]?.color || 'text.secondary' }}>
                                            {TYPE_META[c.type]?.label || c.type}
                                        </TableCell>
                                        <TableCell align="right" sx={{ width: 150 }}>
                                            <TextField
                                                value={amounts[c.id] ? String(amounts[c.id]) : ''}
                                                onChange={e => {
                                                    const v = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                                    setAmounts(prev => ({ ...prev, [c.id]: v }));
                                                }}
                                                placeholder="0"
                                                size="small"
                                                inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                                                sx={{ width: 130 }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>

                    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                        <Typography
                            variant="caption"
                            sx={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, color: 'text.secondary' }}
                        >
                            Samtals
                        </Typography>
                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {Object.entries(totals).map(([type, total]) =>
                                total > 0 ? (
                                    <Box key={type} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: TYPE_META[type]?.color || 'text.primary' }}>
                                            {TYPE_META[type]?.label || type}
                                        </Typography>
                                        <Typography variant="body2">{fmtAmount(total)}</Typography>
                                    </Box>
                                ) : null
                            )}
                            <Box sx={{
                                display: 'flex', justifyContent: 'space-between',
                                borderTop: '1px solid rgba(0,0,0,0.12)', pt: 0.75, mt: 0.5,
                            }}>
                                <Typography variant="body2" fontWeight={600}>Heildartala</Typography>
                                <Typography variant="body2" fontWeight={600}>{fmtAmount(grandTotal)}</Typography>
                            </Box>
                        </Box>
                    </Paper>
                </>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                <Button variant="outlined" onClick={onBack}>← Til baka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={onNext}
                    disabled={categories.length === 0}
                >
                    Áfram →
                </Button>
            </Box>
        </Box>
    );
}

function Step3({ year, totals, grandTotal, categories, submitting, error, onBack, onConfirm }) {
    const typesWithAmount = Object.entries(totals).filter(([, v]) => v > 0);
    return (
        <Box sx={{ maxWidth: 520 }}>
            <Typography variant="caption" color="text.secondary">Skref 3 af 3</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, mb: 1 }}>Yfirlit og staðfesting</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                Áætlun {year} — yfirlit eftir tegund
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {typesWithAmount.map(([type, total]) => {
                    const count = categories.filter(c => c.type === type).length;
                    const meta = TYPE_META[type] || { label: type, color: 'inherit' };
                    return (
                        <Box
                            key={type}
                            sx={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                p: 1.5, borderRadius: 1,
                                border: `1px solid ${meta.color}44`,
                                bgcolor: `${meta.color}18`,
                            }}
                        >
                            <Box>
                                <Typography fontWeight={600} sx={{ color: meta.color, fontSize: '0.9rem' }}>
                                    {meta.label}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {count} {count === 1 ? 'flokkur' : 'flokkar'}
                                </Typography>
                            </Box>
                            <Typography fontWeight={600}>{fmtAmount(total)}</Typography>
                        </Box>
                    );
                })}
                <Box sx={{
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: '2px solid rgba(0,0,0,0.12)', pt: 1.5, mt: 0.5,
                }}>
                    <Typography fontWeight={600}>Heildartala</Typography>
                    <Typography fontWeight={700} sx={{ fontSize: '1.05rem' }}>{fmtAmount(grandTotal)}</Typography>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button variant="outlined" onClick={onBack}>← Til baka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={submitting || grandTotal === 0}
                    onClick={onConfirm}
                >
                    {submitting
                        ? <CircularProgress size={18} color="inherit" />
                        : '✓ Staðfesta og virkja áætlun'}
                </Button>
            </Box>
        </Box>
    );
}

export default BudgetWizardPage;
```

- [ ] **Step 2: Add route in `App.js`**

In `HusfelagJS/src/App.js`:

**a)** Add import after the `BudgetPage` import line:

```javascript
import BudgetWizardPage from './controlers/BudgetWizardPage';
```

**b)** Add route after the `/aaetlun` route:

```jsx
            <Route path="/aaetlun/nyr" element={<BudgetWizardPage />} />
```

- [ ] **Step 3: Smoke test manually**

Start dev server: `cd HusfelagJS && npm start`

Navigate to `/aaetlun` — budget page loads, create button visible.
Click the create button — navigates to `/aaetlun/nyr`.
Wizard loads, spinner shows briefly, Step 1 appears.
If no previous budget: "Engin fyrri áætlun" message + "Áfram →" button.
If previous budget exists: two option cards.
Clicking through to Step 3 and confirming calls `POST /Budget/wizard`.

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/BudgetWizardPage.js HusfelagJS/src/App.js
git commit -m "feat: BudgetWizardPage — 3-step guided budget creation at /aaetlun/nyr"
```

---

## Task 6: Frontend — SuperAdmin global categories panel

**Files:**
- Modify: `HusfelagJS/src/controlers/SuperAdminPage.js`

- [ ] **Step 1: Add `GlobalCategoriesPanel` to `SuperAdminPage.js`**

In `HusfelagJS/src/controlers/SuperAdminPage.js`:

**a)** Add these MUI imports to the existing import block (add only the ones not already imported):

```javascript
import {
    Box, Typography, Divider, Paper, TextField, Button,
    CircularProgress, Alert, Grid,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Table, TableHead, TableRow, TableCell, TableBody,
    Collapse, IconButton, Tooltip,
    MenuItem, Select, FormControl, InputLabel,
    DialogContentText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
```

**b)** Add the `CATEGORY_TYPES` constant and `typeLabel` helper after the `API_URL` line:

```javascript
const CATEGORY_TYPES = [
    { value: 'SHARED', label: 'Sameiginlegt' },
    { value: 'SHARE2', label: 'Hiti' },
    { value: 'SHARE3', label: 'Lóð' },
    { value: 'EQUAL',  label: 'Jafnskipt' },
];
const typeLabel = (type) => CATEGORY_TYPES.find(t => t.value === type)?.label || type;
```

**c)** In the `SuperAdminPage` component, add a full-width row below the existing Grid:

```jsx
                <Grid item xs={12}>
                    <GlobalCategoriesPanel user={user} />
                </Grid>
```

Full updated `SuperAdminPage` render:

```jsx
    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                <Typography variant="h5" gutterBottom>Kerfisstjóri</Typography>
                <Divider sx={{ mb: 4 }} />
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <CreateAssociationPanel user={user} onCreated={(assoc) => setCurrentAssociation(assoc)} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ImpersonatePanel user={user} onSelect={(assoc) => setCurrentAssociation(assoc)} />
                    </Grid>
                    <Grid item xs={12}>
                        <GlobalCategoriesPanel user={user} />
                    </Grid>
                </Grid>
            </Box>
        </div>
    );
```

**d)** Add `GlobalCategoriesPanel`, `AddCategoryForm`, `CategoryRow`, and `EditCategoryDialog` components at the end of the file, before `export default SuperAdminPage`:

```javascript
function GlobalCategoriesPanel({ user }) {
    const [categories, setCategories] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [showDisabled, setShowDisabled] = React.useState(false);

    React.useEffect(() => { loadCategories(); }, []);

    const loadCategories = async () => {
        try {
            const resp = await fetch(`${API_URL}/Category/${user.id}`);
            if (resp.ok) setCategories(await resp.json());
            else { setError('Villa við að sækja flokka.'); setCategories([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setCategories([]);
        }
    };

    if (categories === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    const active = categories.filter(c => !c.deleted);
    const disabled = categories.filter(c => c.deleted);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="h6">Flokkar</Typography>
                    <Typography variant="body2" color="text.secondary">Gildir fyrir öll húsfélög</Typography>
                </Box>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={() => setShowForm(v => !v)}
                >
                    {showForm ? 'Loka' : '+ Bæta við flokk'}
                </Button>
            </Box>

            <Collapse in={showForm}>
                <GlobalAddCategoryForm
                    userId={user.id}
                    onCreated={() => { setShowForm(false); loadCategories(); }}
                />
            </Collapse>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {active.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                    Enginn flokkur skráður.
                </Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                <TableCell>Nafn</TableCell>
                                <TableCell>Tegund</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {active.map(c => (
                                <GlobalCategoryRow key={c.id} category={c} userId={user.id} onSaved={loadCategories} />
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
                        {showDisabled ? '▲' : '▼'} Óvirkir flokkar ({disabled.length})
                    </Button>
                    <Collapse in={showDisabled}>
                        <Paper variant="outlined" sx={{ mt: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                        <TableCell>Nafn</TableCell>
                                        <TableCell>Tegund</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {disabled.map(c => (
                                        <GlobalCategoryRow key={c.id} category={c} userId={user.id} onSaved={loadCategories} isDisabled />
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

function GlobalAddCategoryForm({ userId, onCreated }) {
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    const isValid = name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Category`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name: name.trim(), type }),
            });
            if (resp.ok) {
                setName(''); setType('');
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
            <TextField
                label="Nafn flokks" value={name}
                onChange={e => setName(e.target.value)}
                size="small" fullWidth
            />
            <FormControl size="small" fullWidth>
                <InputLabel>Tegund</InputLabel>
                <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                    {CATEGORY_TYPES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista flokk'}
            </Button>
        </Paper>
    );
}

function GlobalCategoryRow({ category, userId, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell>{category.name}</TableCell>
                <TableCell>{typeLabel(category.type)}</TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <GlobalEditCategoryDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                category={category}
                userId={userId}
                isDisabled={isDisabled}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function GlobalEditCategoryDialog({ open, onClose, category, userId, isDisabled, onSaved }) {
    const [name, setName] = React.useState(category.name);
    const [type, setType] = React.useState(category.type);
    const [saving, setSaving] = React.useState(false);
    const [disabling, setDisabling] = React.useState(false);
    const [confirmDisable, setConfirmDisable] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) { setName(category.name); setType(category.type); setError(''); }
    }, [open, category]);

    const isValid = name.trim() && type;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Category/update/${category.id}?user_id=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type }),
            });
            if (resp.ok) {
                if (isDisabled) {
                    await fetch(`${API_URL}/Category/enable/${category.id}?user_id=${userId}`, { method: 'PATCH' });
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
            const resp = await fetch(`${API_URL}/Category/delete/${category.id}?user_id=${userId}`, { method: 'DELETE' });
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
                <DialogTitle>{isDisabled ? 'Óvirkur flokkur' : 'Breyta flokk'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField
                        label="Nafn flokks" value={name}
                        onChange={e => setName(e.target.value)}
                        size="small" fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {CATEGORY_TYPES.map(t => (
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
                                Óvirkja flokk
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
                                : isDisabled ? 'Virkja flokk' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Óvirkja flokk</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Ertu viss um að þú viljir óvirkja flokkinn <strong>{category.name}</strong>?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button color="error" variant="contained" disabled={disabling} onClick={handleDisable}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Já, óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
```

- [ ] **Step 2: Smoke test manually**

Navigate to `/superadmin` (as superadmin user). Verify:
- "Flokkar" panel appears below Stofna / Opna panels.
- "+ Bæta við flokk" opens an inline form.
- Adding a category creates it and shows in the table.
- Clicking the edit icon opens dialog; saving works; disabling works.

- [ ] **Step 3: Commit**

```bash
git add HusfelagJS/src/controlers/SuperAdminPage.js
git commit -m "feat: global categories panel in superadmin page"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Category global ✓ | `GET /Category/list` ✓ | `POST /Budget/wizard` ✓ | superadmin guards ✓ | `_create_budget_items` removed ✓ | BudgetWizardPage all 3 steps ✓ | SuperAdmin panel ✓ | Sidebar Flokkar removed ✓ | BudgetPage button navigates to wizard ✓
- [x] **No placeholders:** All steps have complete code.
- [x] **Type consistency:** `category_id` / `category.id` used consistently. `BudgetItem.category_id` (the FK field name in Django) used in `bulk_create`. `item["category_id"]` from wizard POST body matches what frontend sends.
