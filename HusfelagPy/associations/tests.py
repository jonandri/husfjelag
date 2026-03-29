from django.test import TestCase, Client
from unittest.mock import patch, MagicMock
from .models import Association, HMSImportSource, Apartment
from .scraper import scrape_hms_apartments
import json
import logging
from users.models import User


class HMSImportSourceModelTest(TestCase):
    def setUp(self):
        self.association = Association.objects.create(
            ssn="1234567890", name="Test Húsfélag",
            address="Testgata 1", postal_code="101", city="Reykjavík"
        )

    def test_create_source(self):
        src = HMSImportSource.objects.create(
            association=self.association,
            url="https://hms.is/fasteignaskra/228369/1203373",
            landeign_id=228369,
            stadfang_id=1203373,
        )
        self.assertEqual(src.association, self.association)
        self.assertEqual(src.landeign_id, 228369)
        self.assertEqual(src.stadfang_id, 1203373)
        self.assertIsNotNone(src.last_imported_at)

    def test_unique_together(self):
        HMSImportSource.objects.create(
            association=self.association,
            url="https://hms.is/fasteignaskra/228369/1203373",
            landeign_id=228369,
            stadfang_id=1203373,
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            HMSImportSource.objects.create(
                association=self.association,
                url="https://hms.is/fasteignaskra/228369/1203373",
                landeign_id=228369,
                stadfang_id=1203373,
            )


class ScrapeHMSApartmentsTest(TestCase):

    def _make_api_response(self, fasteignir):
        """Minimal JSON mimicking the hms.is stadfang API response."""
        return {"stadfangData": {"fasteignir": fasteignir}}

    def test_scrape_returns_apartments(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = self._make_api_response([
            {"fasteign_nr": 2011134, "merking": "010101", "einflm": 68.5},
            {"fasteign_nr": 2011135, "merking": "020101", "einflm": 72.0},
        ])
        with patch("associations.scraper.requests.get", return_value=mock_resp):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["fnr"], "2011134")
        self.assertEqual(result[0]["anr"], "01 0101")
        self.assertAlmostEqual(float(result[0]["size"]), 68.5)

    def test_scrape_returns_none_on_error(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        with patch("associations.scraper.requests.get", return_value=mock_resp):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertIsNone(result)

    def test_scrape_returns_empty_list_when_no_rows(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = self._make_api_response([])
        with patch("associations.scraper.requests.get", return_value=mock_resp):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertEqual(result, [])

    def test_scrape_returns_none_on_connection_error(self):
        import requests as req_lib
        with patch("associations.scraper.requests.get", side_effect=req_lib.RequestException):
            result = scrape_hms_apartments("https://hms.is/fasteignaskra/228369/1203373")
        self.assertIsNone(result)


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

    def test_preview_returns_502_when_hms_unreachable(self):
        # Suppress django.request logger to avoid Python 3.14/Django 4.1 debug-template crash on 5xx responses
        with patch("associations.views.scrape_hms_apartments", return_value=None):
            with self.assertLogs("django.request", level=logging.ERROR):
                resp = self.client.post(
                    "/Apartment/import/preview",
                    data=json.dumps({"user_id": self.user.id, "urls": ["https://hms.is/fasteignaskra/228369/1203373"]}),
                    content_type="application/json"
                )
        self.assertEqual(resp.status_code, 502)

    def test_preview_missing_urls_returns_400(self):
        resp = self.client.post(
            "/Apartment/import/preview",
            data=json.dumps({"user_id": self.user.id, "urls": []}),
            content_type="application/json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_sources_returns_saved_urls(self):
        HMSImportSource.objects.create(
            association=self.association,
            url="https://hms.is/fasteignaskra/228369/1203373",
            landeign_id=228369,
            stadfang_id=1203373,
        )
        resp = self.client.get(f"/Apartment/import/sources?user_id={self.user.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["url"], "https://hms.is/fasteignaskra/228369/1203373")
        self.assertEqual(data[0]["landeign_id"], 228369)
        self.assertEqual(data[0]["stadfang_id"], 1203373)


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
        src = HMSImportSource.objects.get(association=self.association, stadfang_id=200)
        self.assertEqual(src.landeign_id, 100)
        self.assertEqual(src.url, "https://hms.is/fasteignaskra/100/200")


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

    def test_post_category_missing_user_id_returns_400(self):
        resp = self.client.post(
            "/Category",
            data=json.dumps({"name": "Test", "type": "SHARED"}),  # no user_id
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_put_category_superadmin_succeeds(self):
        from associations.models import Category
        cat = Category.objects.create(name="Old", type="SHARED")
        resp = self.client.put(
            f"/Category/update/{cat.id}?user_id={self.superadmin.id}",
            data=json.dumps({"name": "New", "type": "SHARE2"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "New")

    def test_delete_category_superadmin_succeeds(self):
        from associations.models import Category
        cat = Category.objects.create(name="ToDelete", type="EQUAL")
        resp = self.client.delete(f"/Category/delete/{cat.id}?user_id={self.superadmin.id}")
        self.assertEqual(resp.status_code, 204)
        cat.refresh_from_db()
        self.assertTrue(cat.deleted)

    def test_enable_category_superadmin_succeeds(self):
        from associations.models import Category
        cat = Category.objects.create(name="Disabled", type="SHARED", deleted=True)
        resp = self.client.patch(f"/Category/enable/{cat.id}?user_id={self.superadmin.id}")
        self.assertEqual(resp.status_code, 200)
        cat.refresh_from_db()
        self.assertFalse(cat.deleted)


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

    def test_budget_get_returns_null_when_no_budget(self):
        resp = self.client.get(f"/Budget/{self.user.id}")
        self.assertEqual(resp.status_code, 200)
        # DRF renders Response(None) as empty body; assert no budget data returned
        self.assertFalse(resp.content)

    def test_wizard_returns_400_for_negative_amount(self):
        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": self.user.id,
                "items": [{"category_id": self.cat1.id, "amount": -1}],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_wizard_returns_400_for_non_numeric_amount(self):
        resp = self.client.post(
            "/Budget/wizard",
            data=json.dumps({
                "user_id": self.user.id,
                "items": [{"category_id": self.cat1.id, "amount": "bad"}],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
