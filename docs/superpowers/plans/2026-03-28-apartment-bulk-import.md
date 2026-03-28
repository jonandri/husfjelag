# Apartment Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-step wizard that imports apartments from hms.is/fasteignaskra into the association, with create/update/deactivate preview before confirming.

**Architecture:** Backend scrapes hms.is server-side (requests + BeautifulSoup, same pattern as the existing `lookup_association` scraper). Two new API endpoints handle preview and confirm. A new `HMSImportSource` model persists the URLs per association. The frontend is a full-page wizard at `/ibudir/innflutningur`.

**Tech Stack:** Django 4.1, Django REST Framework, BeautifulSoup4, React 17, MUI v5

---

## File Map

### Backend — new/modified
| Action | File |
|--------|------|
| Modify | `HusfelagPy/associations/models.py` |
| Create | `HusfelagPy/associations/migrations/000N_add_hmsimportsource.py` (auto-generated) |
| Modify | `HusfelagPy/associations/scraper.py` |
| Modify | `HusfelagPy/associations/views.py` |
| Modify | `HusfelagPy/associations/urls.py` |
| Modify | `HusfelagPy/associations/tests.py` |

### Frontend — new/modified
| Action | File |
|--------|------|
| Create | `HusfelagJS/src/controlers/ApartmentImportPage.js` |
| Modify | `HusfelagJS/src/App.js` |
| Modify | `HusfelagJS/src/controlers/ApartmentsPage.js` |

---

## Task 1: `HMSImportSource` model + migration

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing test**

Add to `HusfelagPy/associations/tests.py`:

```python
from django.test import TestCase
from .models import Association, HMSImportSource


class HMSImportSourceModelTest(TestCase):
    def setUp(self):
        self.association = Association.objects.create(
            ssn="1234567890", name="Test Húsfélag",
            address="Testgata 1", postal_code="101", city="Reykjavík"
        )

    def test_create_source(self):
        src = HMSImportSource.objects.create(
            association=self.association,
            url="https://hms.is/fasteignaskra/228369/1203373"
        )
        self.assertEqual(src.association, self.association)
        self.assertIsNotNone(src.last_imported_at)

    def test_unique_together(self):
        HMSImportSource.objects.create(
            association=self.association,
            url="https://hms.is/fasteignaskra/228369/1203373"
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            HMSImportSource.objects.create(
                association=self.association,
                url="https://hms.is/fasteignaskra/228369/1203373"
            )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.HMSImportSourceModelTest -v 2
```
Expected: `ImportError` or `AttributeError` — `HMSImportSource` does not exist yet.

- [ ] **Step 3: Add model to `models.py`**

Add at the bottom of `HusfelagPy/associations/models.py`:

```python
class HMSImportSource(models.Model):
    association = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="hms_sources")
    url = models.URLField()
    last_imported_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "associations_hmsimportsource"
        unique_together = [("association", "url")]

    def __str__(self):
        return f"{self.association} — {self.url}"
```

- [ ] **Step 4: Generate and apply migration**

```bash
cd HusfelagPy && poetry run python manage.py makemigrations associations --name add_hmsimportsource
poetry run python manage.py migrate
```
Expected: new migration file created, `OK` on migrate.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.HMSImportSourceModelTest -v 2
```
Expected: `OK`, 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add HusfelagPy/associations/models.py HusfelagPy/associations/migrations/ HusfelagPy/associations/tests.py
git commit -m "feat: add HMSImportSource model and migration"
```

---

## Task 2: Scraper — `scrape_hms_apartments`

**Files:**
- Modify: `HusfelagPy/associations/scraper.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing test**

Add to `HusfelagPy/associations/tests.py`:

```python
from unittest.mock import patch, MagicMock
from .scraper import scrape_hms_apartments


class ScrapeHMSApartmentsTest(TestCase):

    def _make_html(self):
        """Minimal HTML mimicking the hms.is apartment table."""
        return """
        <html><body>
        <table>
          <thead><tr>
            <th>Fasteignanúmer</th><th>Merking</th><th>Stærð</th>
          </tr></thead>
          <tbody>
            <tr><td>2011134</td><td>0101</td><td>68,50</td></tr>
            <tr><td>2011135</td><td>0201</td><td>72,00</td></tr>
          </tbody>
        </table>
        </body></html>
        """

    def test_scrape_returns_apartments(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = self._make_html().encode()
        with patch("associations.scraper.requests.get", return_value=mock_resp):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["fnr"], "2011134")
        self.assertEqual(result[0]["anr"], "0101")
        self.assertAlmostEqual(float(result[0]["size"]), 68.50)

    def test_scrape_returns_none_on_error(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        with patch("associations.scraper.requests.get", return_value=mock_resp):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertIsNone(result)

    def test_scrape_returns_empty_list_when_no_rows(self):
        html = "<html><body><table><thead><tr><th>Fasteignanúmer</th><th>Merking</th><th>Stærð</th></tr></thead><tbody></tbody></table></body></html>"
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = html.encode()
        with patch("associations.scraper.requests.get", return_value=mock_resp):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertEqual(result, [])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ScrapeHMSApartmentsTest -v 2
```
Expected: `ImportError` — `scrape_hms_apartments` not defined yet.

- [ ] **Step 3: Implement `scrape_hms_apartments` in `scraper.py`**

Add to the bottom of `HusfelagPy/associations/scraper.py`:

```python
HMS_URL_PATTERN = re.compile(r'^https://hms\.is/fasteignaskra/\d+/\d+$')


def scrape_hms_apartments(url: str) -> list[dict] | None:
    """
    Scrape hms.is/fasteignaskra for apartment list.
    Returns list of {fnr, anr, size} or None on HTTP/connection failure.
    Returns [] if page loads but no apartment rows found.
    """
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    except requests.RequestException:
        return None

    if resp.status_code != 200:
        return None

    soup = BeautifulSoup(resp.content, "html.parser")

    # Find table whose header row contains Fasteignanúmer, Merking, Stærð
    target_table = None
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if any("Fasteignanúmer" in h for h in headers):
            target_table = table
            break

    if not target_table:
        return []

    # Map column index by header name
    header_row = target_table.find("thead")
    if not header_row:
        return []
    ths = [th.get_text(strip=True) for th in header_row.find_all("th")]

    def col(name):
        for i, h in enumerate(ths):
            if name in h:
                return i
        return None

    fnr_col = col("Fasteignanúmer")
    anr_col = col("Merking")
    size_col = col("Stærð")

    if fnr_col is None or anr_col is None or size_col is None:
        return []

    results = []
    tbody = target_table.find("tbody")
    if not tbody:
        return []

    for tr in tbody.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) <= max(fnr_col, anr_col, size_col):
            continue
        fnr = cells[fnr_col].get_text(strip=True)
        anr = cells[anr_col].get_text(strip=True)
        size_raw = cells[size_col].get_text(strip=True).replace(",", ".")
        try:
            size = float(size_raw)
        except ValueError:
            size = 0.0
        if fnr:
            results.append({"fnr": fnr, "anr": anr, "size": size})

    return results
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ScrapeHMSApartmentsTest -v 2
```
Expected: `OK`, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/scraper.py HusfelagPy/associations/tests.py
git commit -m "feat: add scrape_hms_apartments to scraper"
```

---

## Task 3: Preview and Sources endpoints

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
from unittest.mock import patch
from django.test import TestCase, Client
from django.urls import reverse
import json
from .models import Association, HMSImportSource, Apartment
from users.models import User


class ImportPreviewViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="1234567890", name="Test User")
        self.association = Association.objects.create(
            ssn="0987654321", name="Test Húsfélag",
            address="Testgata 1", postal_code="101", city="Reykjavík"
        )
        from associations.models import AssociationAccess, AssociationRole
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role=AssociationRole.CHAIR, active=True
        )

    def test_preview_classifies_create_update_missing(self):
        # existing apartment in DB
        Apartment.objects.create(
            association=self.association, fnr="2011135", anr="0201", size=70.0
        )
        scraped = [
            {"fnr": "2011134", "anr": "0101", "size": 68.5},  # new
            {"fnr": "2011135", "anr": "0201", "size": 72.0},  # update
        ]
        with patch("associations.views.scrape_hms_apartments", return_value=scraped):
            resp = self.client.post(
                "/Apartment/import/preview",
                data=json.dumps({"user_id": self.user.id, "urls": ["https://hms.is/fasteignaskra/228369/1203373"]}),
                content_type="application/json"
            )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["create"]), 1)
        self.assertEqual(data["create"][0]["fnr"], "2011134")
        self.assertEqual(len(data["update"]), 1)
        self.assertEqual(data["update"][0]["fnr"], "2011135")
        self.assertEqual(len(data["missing"]), 0)

    def test_preview_reports_missing_apartment(self):
        Apartment.objects.create(
            association=self.association, fnr="2011099", anr="0301", size=55.0
        )
        with patch("associations.views.scrape_hms_apartments", return_value=[]):
            resp = self.client.post(
                "/Apartment/import/preview",
                data=json.dumps({"user_id": self.user.id, "urls": ["https://hms.is/fasteignaskra/228369/1203373"]}),
                content_type="application/json"
            )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["missing"]), 1)
        self.assertEqual(data["missing"][0]["fnr"], "2011099")

    def test_preview_invalid_url_returns_400(self):
        resp = self.client.post(
            "/Apartment/import/preview",
            data=json.dumps({"user_id": self.user.id, "urls": ["https://example.com/bad"]}),
            content_type="application/json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_sources_returns_saved_urls(self):
        HMSImportSource.objects.create(
            association=self.association,
            url="https://hms.is/fasteignaskra/228369/1203373"
        )
        resp = self.client.get(f"/Apartment/import/sources?user_id={self.user.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["url"], "https://hms.is/fasteignaskra/228369/1203373")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ImportPreviewViewTest -v 2
```
Expected: 404 errors — endpoints don't exist yet.

- [ ] **Step 3: Add views to `views.py`**

Add these imports at the top of `HusfelagPy/associations/views.py` (after existing imports):

```python
import re
from .models import HMSImportSource
from .scraper import scrape_hms_apartments
```

Then add these classes at the bottom of `views.py`:

```python
HMS_URL_RE = re.compile(r'^https://hms\.is/fasteignaskra/\d+/\d+$')


class ApartmentImportSourcesView(APIView):
    def get(self, request):
        """GET /Apartment/import/sources?user_id=N — Return saved HMS URLs for the association."""
        user_id = request.query_params.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        association = _resolve_assoc(int(user_id), request)
        if not association:
            return Response([], status=status.HTTP_200_OK)
        sources = association.hms_sources.order_by("url").values("url", "last_imported_at")
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

        association = _resolve_assoc(int(user_id), request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

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

        # Upsert HMS sources
        for url in urls:
            HMSImportSource.objects.update_or_create(
                association=association,
                url=url,
                defaults={}  # last_imported_at uses auto_now=True, updated on save
            )

        # Return updated apartment list
        apartments = association.apartments.all()
        return Response(ApartmentSerializer(apartments, many=True).data)
```

- [ ] **Step 4: Register routes in `urls.py`**

In `HusfelagPy/associations/urls.py`, add the new imports and paths:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView, CategoryView,
    BudgetView, BudgetItemView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)

urlpatterns = [
    # ... existing patterns unchanged ...
    path("Apartment/import/sources", ApartmentImportSourcesView.as_view(), name="apartment-import-sources"),
    path("Apartment/import/preview", ApartmentImportPreviewView.as_view(), name="apartment-import-preview"),
    path("Apartment/import/confirm", ApartmentImportConfirmView.as_view(), name="apartment-import-confirm"),
]
```

Keep all existing `urlpatterns` entries — only append the three new lines.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ImportPreviewViewTest -v 2
```
Expected: `OK`, 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git commit -m "feat: add apartment import preview, confirm, and sources endpoints"
```

---

## Task 4: Confirm endpoint tests

**Files:**
- Test: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
class ImportConfirmViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="1111111111", name="Confirm User")
        self.association = Association.objects.create(
            ssn="2222222222", name="Confirm Húsfélag",
            address="Confirmgata 2", postal_code="200", city="Kópavogur"
        )
        from associations.models import AssociationAccess, AssociationRole
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role=AssociationRole.CHAIR, active=True
        )

    def test_confirm_creates_new_apartments(self):
        scraped = [{"fnr": "3011100", "anr": "0101", "size": 50.0}]
        with patch("associations.views.scrape_hms_apartments", return_value=scraped):
            resp = self.client.post(
                "/Apartment/import/confirm",
                data=json.dumps({
                    "user_id": self.user.id,
                    "urls": ["https://hms.is/fasteignaskra/100/200"],
                    "deactivate_ids": []
                }),
                content_type="application/json"
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            self.association.apartments.filter(fnr="3011100", deleted=False).exists()
        )

    def test_confirm_updates_existing_apartment(self):
        apt = Apartment.objects.create(
            association=self.association, fnr="3011101", anr="OLD", size=40.0
        )
        scraped = [{"fnr": "3011101", "anr": "NEW", "size": 45.0}]
        with patch("associations.views.scrape_hms_apartments", return_value=scraped):
            resp = self.client.post(
                "/Apartment/import/confirm",
                data=json.dumps({
                    "user_id": self.user.id,
                    "urls": ["https://hms.is/fasteignaskra/100/200"],
                    "deactivate_ids": []
                }),
                content_type="application/json"
            )
        self.assertEqual(resp.status_code, 200)
        apt.refresh_from_db()
        self.assertEqual(apt.anr, "NEW")
        self.assertAlmostEqual(float(apt.size), 45.0)

    def test_confirm_deactivates_selected_apartments(self):
        apt = Apartment.objects.create(
            association=self.association, fnr="3011199", anr="0901", size=60.0
        )
        with patch("associations.views.scrape_hms_apartments", return_value=[]):
            resp = self.client.post(
                "/Apartment/import/confirm",
                data=json.dumps({
                    "user_id": self.user.id,
                    "urls": ["https://hms.is/fasteignaskra/100/200"],
                    "deactivate_ids": [apt.id]
                }),
                content_type="application/json"
            )
        self.assertEqual(resp.status_code, 200)
        apt.refresh_from_db()
        self.assertTrue(apt.deleted)

    def test_confirm_saves_hms_source(self):
        with patch("associations.views.scrape_hms_apartments", return_value=[]):
            self.client.post(
                "/Apartment/import/confirm",
                data=json.dumps({
                    "user_id": self.user.id,
                    "urls": ["https://hms.is/fasteignaskra/100/200"],
                    "deactivate_ids": []
                }),
                content_type="application/json"
            )
        self.assertTrue(
            HMSImportSource.objects.filter(
                association=self.association,
                url="https://hms.is/fasteignaskra/100/200"
            ).exists()
        )
```

- [ ] **Step 2: Run tests**

```bash
cd HusfelagPy && poetry run python manage.py test associations.tests.ImportConfirmViewTest -v 2
```
Expected: `OK`, 4 tests passed (views already implemented in Task 3).

- [ ] **Step 3: Commit**

```bash
git add HusfelagPy/associations/tests.py
git commit -m "test: add confirm endpoint tests"
```

---

## Task 5: `ApartmentImportPage.js` — Steps 1 and 2

**Files:**
- Create: `HusfelagJS/src/controlers/ApartmentImportPage.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Create `ApartmentImportPage.js` with Steps 1 and 2**

Create `HusfelagJS/src/controlers/ApartmentImportPage.js`:

```jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, TextField, CircularProgress,
    Alert, IconButton, Paper, Link,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SideBar from './Sidebar';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';
const HMS_URL_PATTERN = /^https:\/\/hms\.is\/fasteignaskra\/\d+\/\d+$/;

function ApartmentImportPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [step, setStep] = useState(1);
    const [urls, setUrls] = useState(['']);
    const [preview, setPreview] = useState(null);
    const [deactivateIds, setDeactivateIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        // Pre-fill URLs from saved sources
        fetch(`${API_URL}/Apartment/import/sources?user_id=${user.id}${assocParam ? `&as=${assocParam.replace('?as=', '')}` : ''}`)
            .then(r => r.ok ? r.json() : [])
            .then(sources => {
                if (sources.length > 0) setUrls(sources.map(s => s.url));
            })
            .catch(() => {});
    }, [user]);

    const urlsValid = urls.every(u => HMS_URL_PATTERN.test(u.trim())) && urls.some(u => u.trim());

    const handleFetchPreview = async () => {
        setError('');
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/import/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, urls: urls.filter(u => u.trim()) }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                setError(data.detail || 'Villa við að sækja gögn.');
                return;
            }
            const allDeactivate = new Set(data.missing.map(m => m.id));
            setDeactivateIds(allDeactivate);
            setPreview(data);
            setStep(3);
        } catch {
            setError('Ekki tókst að ná sambandi við þjón.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setError('');
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/import/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    urls: urls.filter(u => u.trim()),
                    deactivate_ids: Array.from(deactivateIds),
                }),
            });
            if (resp.ok) {
                navigate('/ibudir');
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við innflutning. Reyndu aftur.');
            }
        } catch {
            setError('Ekki tókst að ná sambandi við þjón.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0, maxWidth: 700 }}>
                <Box sx={{ mb: 2 }}>
                    <Link
                        component="button"
                        variant="body2"
                        color="text.secondary"
                        onClick={() => navigate('/ibudir')}
                        sx={{ textDecoration: 'none' }}
                    >
                        ← Íbúðir
                    </Link>
                </Box>
                <Typography variant="h5" sx={{ mb: 3 }}>
                    Flytja inn íbúðir frá HMS
                </Typography>

                {/* Step indicator */}
                <Box sx={{ display: 'flex', gap: 1, mb: 4 }}>
                    {[1, 2, 3].map(n => (
                        <Box key={n} sx={{
                            height: 4, flex: 1, borderRadius: 2,
                            bgcolor: step >= n ? 'secondary.main' : 'rgba(255,255,255,0.15)'
                        }} />
                    ))}
                </Box>

                {step === 1 && <Step1 onNext={() => setStep(2)} />}
                {step === 2 && (
                    <Step2
                        urls={urls}
                        setUrls={setUrls}
                        urlsValid={urlsValid}
                        loading={loading}
                        error={error}
                        onBack={() => setStep(1)}
                        onFetch={handleFetchPreview}
                    />
                )}
                {step === 3 && preview && (
                    <Step3
                        preview={preview}
                        deactivateIds={deactivateIds}
                        setDeactivateIds={setDeactivateIds}
                        loading={loading}
                        error={error}
                        onBack={() => setStep(2)}
                        onConfirm={handleConfirm}
                    />
                )}
            </Box>
        </div>
    );
}

function Step1({ onNext }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1" color="text.secondary">
                Þú ert að fara að flytja inn íbúðir úr fasteignaskrá HMS. Ferlið tekur um 2 mínútur.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, borderColor: 'secondary.main', bgcolor: 'rgba(8,192,118,0.05)' }}>
                <Typography variant="subtitle2" color="secondary" sx={{ mb: 0.5 }}>
                    1. Opnaðu fasteignaskrána
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Leitaðu að heimilisfangi húsfélagsins og staðfestu að allar íbúðir séu sýnilegar.
                </Typography>
                <Button
                    variant="outlined"
                    color="secondary"
                    size="small"
                    href="https://hms.is/fasteignaskra"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Opna hms.is/fasteignaskra →
                </Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>2. Afritaðu hlekk</Typography>
                <Typography variant="body2" color="text.secondary">
                    Þegar þú hefur fundið húsið þitt, afritaðu slóðina úr vafranum, t.d.:
                </Typography>
                <Typography variant="body2" color="secondary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    https://hms.is/fasteignaskra/228369/1203373
                </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>3. Ef húsfélagið hefur fleiri en eitt heimilisfang</Typography>
                <Typography variant="body2" color="text.secondary">
                    T.d. nr. 38 og 40 — þú getur bætt við fleiri hlekkjum á næsta skrefi.
                </Typography>
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={onNext}>
                    Áfram →
                </Button>
            </Box>
        </Box>
    );
}

function Step2({ urls, setUrls, urlsValid, loading, error, onBack, onFetch }) {
    const addUrl = () => setUrls(u => [...u, '']);
    const removeUrl = (i) => setUrls(u => u.filter((_, idx) => idx !== i));
    const setUrl = (i, val) => setUrls(u => u.map((v, idx) => idx === i ? val : v));

    const invalid = urls.map(u => u.trim() && !/^https:\/\/hms\.is\/fasteignaskra\/\d+\/\d+$/.test(u.trim()));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
                Límdu hlekk(a) fyrir hvert heimilisfang húsfélagsins:
            </Typography>

            {urls.map((url, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                        label={`Heimilisfang ${i + 1}`}
                        value={url}
                        onChange={e => setUrl(i, e.target.value)}
                        size="small"
                        fullWidth
                        error={!!invalid[i]}
                        helperText={invalid[i] ? 'Slóðin er ekki í réttu sniði. Dæmi: https://hms.is/fasteignaskra/228369/1203373' : ''}
                        placeholder="https://hms.is/fasteignaskra/228369/1203373"
                    />
                    {urls.length > 1 && (
                        <IconButton size="small" onClick={() => removeUrl(i)} sx={{ mt: 0.5 }}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>
            ))}

            <Button
                variant="text"
                color="secondary"
                size="small"
                sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                onClick={addUrl}
            >
                + Bæta við heimilisfangi
            </Button>

            {error && <Alert severity="error">{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Button onClick={onBack} color="inherit">← Til baka</Button>
                <Button
                    variant="contained"
                    color="secondary"
                    sx={{ color: '#fff' }}
                    disabled={!urlsValid || loading}
                    onClick={onFetch}
                >
                    {loading ? <CircularProgress size={20} color="inherit" /> : 'Sækja gögn →'}
                </Button>
            </Box>
        </Box>
    );
}

function Step3({ preview, deactivateIds, setDeactivateIds, loading, error, onBack, onConfirm }) {
    const toggleDeactivate = (id) => {
        setDeactivateIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const STATUS_COLORS = {
        create: '#08C076',
        update: '#ffcc00',
        missing: '#ff5050',
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Summary chips */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {preview.create.length > 0 && (
                    <Box sx={{ border: `1px solid ${STATUS_COLORS.create}`, borderRadius: 1, px: 1.5, py: 0.5 }}>
                        <Typography variant="caption" sx={{ color: STATUS_COLORS.create }}>
                            ✓ {preview.create.length} íbúðir til að búa til
                        </Typography>
                    </Box>
                )}
                {preview.update.length > 0 && (
                    <Box sx={{ border: `1px solid ${STATUS_COLORS.update}`, borderRadius: 1, px: 1.5, py: 0.5 }}>
                        <Typography variant="caption" sx={{ color: STATUS_COLORS.update }}>
                            ↻ {preview.update.length} íbúðir til að uppfæra
                        </Typography>
                    </Box>
                )}
                {preview.missing.length > 0 && (
                    <Box sx={{ border: `1px solid ${STATUS_COLORS.missing}`, borderRadius: 1, px: 1.5, py: 0.5 }}>
                        <Typography variant="caption" sx={{ color: STATUS_COLORS.missing }}>
                            ⚠ {preview.missing.length} íbúð ekki á HMS
                        </Typography>
                    </Box>
                )}
            </Box>

            <Paper variant="outlined">
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <Box component="thead">
                        <Box component="tr" sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            {['Merking', 'Fasteignanúmer', 'Stærð', 'Staða', 'Óvirkja'].map(h => (
                                <Box component="th" key={h} sx={{ p: 1, textAlign: 'left', color: 'text.secondary', fontWeight: 500 }}>
                                    {h}
                                </Box>
                            ))}
                        </Box>
                    </Box>
                    <Box component="tbody">
                        {preview.create.map((apt, i) => (
                            <Box component="tr" key={`c${i}`} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Box component="td" sx={{ p: 1 }}>{apt.anr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.fnr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.size} m²</Box>
                                <Box component="td" sx={{ p: 1 }}><Typography variant="caption" sx={{ color: STATUS_COLORS.create }}>Ný</Typography></Box>
                                <Box component="td" sx={{ p: 1 }}>—</Box>
                            </Box>
                        ))}
                        {preview.update.map((apt) => (
                            <Box component="tr" key={`u${apt.id}`} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Box component="td" sx={{ p: 1 }}>{apt.anr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.fnr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.size} m²</Box>
                                <Box component="td" sx={{ p: 1 }}><Typography variant="caption" sx={{ color: STATUS_COLORS.update }}>Uppfærsla</Typography></Box>
                                <Box component="td" sx={{ p: 1 }}>—</Box>
                            </Box>
                        ))}
                        {preview.missing.map((apt) => (
                            <Box component="tr" key={`m${apt.id}`} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: 0.75 }}>
                                <Box component="td" sx={{ p: 1 }}>{apt.anr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>{apt.fnr}</Box>
                                <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>—</Box>
                                <Box component="td" sx={{ p: 1 }}><Typography variant="caption" sx={{ color: STATUS_COLORS.missing }}>Ekki á HMS</Typography></Box>
                                <Box component="td" sx={{ p: 1, textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={deactivateIds.has(apt.id)}
                                        onChange={() => toggleDeactivate(apt.id)}
                                        style={{ accentColor: STATUS_COLORS.missing }}
                                    />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Paper>

            {error && <Alert severity="error">{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Button onClick={onBack} color="inherit">← Til baka</Button>
                <Button
                    variant="contained"
                    color="secondary"
                    sx={{ color: '#fff' }}
                    disabled={loading}
                    onClick={onConfirm}
                >
                    {loading ? <CircularProgress size={20} color="inherit" /> : '✓ Staðfesta innflutning'}
                </Button>
            </Box>
        </Box>
    );
}

export default ApartmentImportPage;
```

- [ ] **Step 2: Add route to `App.js`**

In `HusfelagJS/src/App.js`, add the import after the existing `ApartmentsPage` import:

```jsx
import ApartmentImportPage from './controlers/ApartmentImportPage';
```

Add the route inside `<Routes>`, after the `/ibudir` route:

```jsx
<Route path="/ibudir/innflutningur" element={<ApartmentImportPage />} />
```

- [ ] **Step 3: Start frontend and manually verify Steps 1 and 2 render**

```bash
cd HusfelagJS && PORT=3010 REACT_APP_API_URL=http://localhost:8010 npm start
```

Navigate to `http://localhost:3010/ibudir/innflutningur`. Verify:
- Step 1 shows 3 instruction panels and a link to hms.is that opens in a new tab
- "Áfram →" advances to Step 2
- Step 2 shows a URL input pre-labelled "Heimilisfang 1"
- "+ Bæta við heimilisfangi" adds a second input
- Pasting an invalid URL shows the Icelandic error message under the field
- "Sækja gögn →" is disabled until all URLs are valid

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/ApartmentImportPage.js HusfelagJS/src/App.js
git commit -m "feat: ApartmentImportPage wizard Steps 1-3"
```

---

## Task 6: Entry points on `ApartmentsPage.js`

**Files:**
- Modify: `HusfelagJS/src/controlers/ApartmentsPage.js`

- [ ] **Step 1: Add onboarding banner and re-import link**

In `ApartmentsPage.js`, find the section that renders when `active.length === 0`:

```jsx
{active.length === 0 ? (
    <Typography color="text.secondary" sx={{ mt: 2 }}>
        Engar íbúðir skráðar. Smelltu á „+ Bæta við íbúð" til að hefja skráningu.
    </Typography>
) : (
```

Replace the empty-state `<Typography>` with an onboarding banner:

```jsx
{active.length === 0 ? (
    <Paper
        variant="outlined"
        sx={{ mt: 2, p: 3, borderColor: 'secondary.main', bgcolor: 'rgba(8,192,118,0.05)' }}
    >
        <Typography variant="subtitle1" color="secondary" sx={{ mb: 0.5 }}>
            Setja upp íbúðir sjálfkrafa
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enginn búinn að skrá íbúðir. Notaðu HMS fasteignaskrána til að flytja inn lista yfir íbúðir sjálfkrafa.
        </Typography>
        <Button
            variant="contained"
            color="secondary"
            sx={{ color: '#fff' }}
            onClick={() => navigate('/ibudir/innflutningur')}
        >
            Flytja inn frá HMS →
        </Button>
    </Paper>
) : (
```

- [ ] **Step 2: Add `useNavigate` import and re-import link in header**

At the top of `ApartmentsPage.js`, `useNavigate` is already imported. In the page header where the "+ Bæta við íbúð" button lives:

```jsx
<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
    <Typography variant="h5">Íbúðir</Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
            variant="text"
            size="small"
            sx={{ color: 'text.secondary', textTransform: 'none', fontSize: '0.8rem' }}
            onClick={() => navigate('/ibudir/innflutningur')}
        >
            ⬇ HMS innflutningur
        </Button>
        <Button
            variant="contained"
            color="secondary"
            sx={{ color: '#fff' }}
            onClick={() => setShowForm(v => !v)}
        >
            {showForm ? 'Loka skráningarformi' : '+ Bæta við íbúð'}
        </Button>
    </Box>
</Box>
```

Replace the existing header `<Box>` with the above.

- [ ] **Step 3: Manually verify both entry points**

With the dev server running:
1. Navigate to `/ibudir` with no apartments — verify green onboarding banner appears, "Flytja inn frá HMS →" button goes to the wizard.
2. Add an apartment manually, then navigate to `/ibudir` — verify the banner is gone and "⬇ HMS innflutningur" text link appears in the header.

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/controlers/ApartmentsPage.js
git commit -m "feat: add HMS import entry points to ApartmentsPage"
```

---

## Task 7: End-to-end smoke test and final commit

- [ ] **Step 1: Run all backend tests**

```bash
cd HusfelagPy && poetry run python manage.py test associations -v 2
```
Expected: All tests pass, no errors.

- [ ] **Step 2: Run full dev stack**

```bash
cd /path/to/husfjelag && ./dev.sh
```

- [ ] **Step 3: Manual end-to-end walkthrough**

1. Log in and navigate to `/ibudir` — confirm onboarding banner shows (if no apartments).
2. Click "Flytja inn frá HMS →" — wizard opens at Step 1.
3. Click "Áfram →" — Step 2 shows.
4. Paste a real hms.is URL (e.g. `https://hms.is/fasteignaskra/228369/1203373`) — "Sækja gögn →" enables.
5. Click "Sækja gögn →" — loading spinner, then Step 3 preview table appears with colour-coded rows.
6. Verify "Ekki á HMS" rows have checkboxes checked by default.
7. Click "Staðfesta innflutning" — navigates back to `/ibudir`, apartments visible.
8. Re-run wizard — verify Step 2 is pre-filled with the saved URL.
9. Check that the "⬇ HMS innflutningur" link in the header is now visible (apartments exist).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: apartment bulk import wizard complete"
```
