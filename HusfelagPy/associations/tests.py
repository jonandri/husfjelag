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
            url="https://hms.is/fasteignaskra/228369/1203373"
        )
        resp = self.client.get(f"/Apartment/import/sources?user_id={self.user.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["url"], "https://hms.is/fasteignaskra/228369/1203373")
