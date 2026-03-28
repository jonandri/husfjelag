from django.db import migrations, models


def populate_ids_from_url(apps, schema_editor):
    """Backfill landeign_id and stadfang_id by parsing existing URL rows."""
    HMSImportSource = apps.get_model("associations", "HMSImportSource")
    for src in HMSImportSource.objects.all():
        parts = src.url.rstrip("/").split("/")
        # URL format: https://hms.is/fasteignaskra/{landeign_id}/{stadfang_id}
        src.landeign_id = int(parts[-2])
        src.stadfang_id = int(parts[-1])
        src.save(update_fields=["landeign_id", "stadfang_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("associations", "0010_apartment_unique_assoc_fnr"),
    ]

    operations = [
        # Add fields as nullable first so existing rows can be backfilled
        migrations.AddField(
            model_name="hmsimportsource",
            name="landeign_id",
            field=models.IntegerField(null=True),
        ),
        migrations.AddField(
            model_name="hmsimportsource",
            name="stadfang_id",
            field=models.IntegerField(null=True),
        ),
        # Backfill from URL
        migrations.RunPython(populate_ids_from_url, migrations.RunPython.noop),
        # Make non-nullable now that all rows are populated
        migrations.AlterField(
            model_name="hmsimportsource",
            name="landeign_id",
            field=models.IntegerField(),
        ),
        migrations.AlterField(
            model_name="hmsimportsource",
            name="stadfang_id",
            field=models.IntegerField(),
        ),
        # Replace unique_together: (association, url) → (association, stadfang_id)
        migrations.AlterUniqueTogether(
            name="hmsimportsource",
            unique_together=set(),
        ),
        migrations.AlterUniqueTogether(
            name="hmsimportsource",
            unique_together={("association", "stadfang_id")},
        ),
    ]
