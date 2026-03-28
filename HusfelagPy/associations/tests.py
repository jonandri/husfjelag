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
