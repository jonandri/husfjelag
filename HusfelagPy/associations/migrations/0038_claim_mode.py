from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("associations", "0037_encrypt_bank_credentials"),
    ]

    operations = [
        migrations.AddField(
            model_name="associationbanksettings",
            name="claim_mode",
            field=models.CharField(
                choices=[
                    ("DIRECT_API", "Stofna innheimtukröfur frá husfjelag.is"),
                    ("BANK_SERVICE", "Nota húsfélagaþjónustu bankans"),
                ],
                default="DIRECT_API",
                max_length=16,
            ),
        ),
    ]
