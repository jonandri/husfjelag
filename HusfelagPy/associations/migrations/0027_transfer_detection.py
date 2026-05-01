from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("associations", "0026_association_board_change_tracking"),
    ]

    operations = [
        # Add transaction_type field to Transaction
        migrations.AddField(
            model_name="transaction",
            name="transaction_type",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        # Extend status max_length to fit "PENDING_TRANSFER" (16 chars)
        migrations.AlterField(
            model_name="transaction",
            name="status",
            field=models.CharField(
                choices=[
                    ("IMPORTED", "Innflutt"),
                    ("CATEGORISED", "Flokkað"),
                    ("RECONCILED", "Jafnað"),
                    ("PENDING_TRANSFER", "Bíður millifærslu"),
                ],
                default="IMPORTED",
                max_length=20,
            ),
        ),
        # New InterAccountTransfer model
        migrations.CreateModel(
            name="InterAccountTransfer",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "association",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transfers",
                        to="associations.association",
                    ),
                ),
                (
                    "inbound_transaction",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transfer_as_inbound",
                        to="associations.transaction",
                    ),
                ),
                (
                    "outbound_transaction",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transfer_as_outbound",
                        to="associations.transaction",
                    ),
                ),
            ],
            options={"db_table": "associations_interaccounttransfer"},
        ),
    ]
