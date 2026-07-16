from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('associations', '0038_claim_mode'),
    ]

    operations = [
        migrations.AlterField(
            model_name='banktokencache',
            name='association',
            field=models.ForeignKey(
                default=None,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='bank_token_caches',
                to='associations.association',
            ),
            preserve_default=False,
        ),
    ]
