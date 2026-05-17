from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("associations", "0031_bank_cert_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="bankaccount",
            name="is_connected",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="bankaccount",
            name="bank_status",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
