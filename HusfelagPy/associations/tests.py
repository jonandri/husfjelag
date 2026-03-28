from django.test import TestCase
from unittest.mock import patch, MagicMock
from .models import Association, HMSImportSource
from .scraper import scrape_hms_apartments


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
