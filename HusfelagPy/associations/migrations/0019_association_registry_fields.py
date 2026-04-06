from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("associations", "0018_collection_paid_transaction_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="association",
            name="date_of_board_change",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="association",
            name="registered",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="association",
            name="status",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
