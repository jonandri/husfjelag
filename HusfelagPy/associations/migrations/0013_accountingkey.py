from django.db import migrations, models

SEED_KEYS = [
    (1200, "Innstæður í bönkum (rekstrar)", "ASSET"),
    (1210, "Varasjóður", "ASSET"),
    (1300, "Útistandandi húsgjöld", "ASSET"),
    (2100, "Ógreidd gjöld", "LIABILITY"),
    (3100, "Eigið fé húsfélags", "EQUITY"),
    (4100, "Tekjur af húsgjöldum", "INCOME"),
    (5100, "Tryggingar", "EXPENSE"),
    (5200, "Hiti og rafmagn", "EXPENSE"),
    (5300, "Þrif og viðhald", "EXPENSE"),
    (5400, "Lóðarkostnaður", "EXPENSE"),
    (5500, "Sameiginleg gjöld", "EXPENSE"),
    (5600, "Rekstur húsfélags", "EXPENSE"),
]


def seed_accounting_keys(apps, schema_editor):
    AccountingKey = apps.get_model("associations", "AccountingKey")
    for number, name, type_ in SEED_KEYS:
        AccountingKey.objects.get_or_create(
            number=number, defaults={"name": name, "type": type_}
        )


def unseed_accounting_keys(apps, schema_editor):
    AccountingKey = apps.get_model("associations", "AccountingKey")
    AccountingKey.objects.filter(number__in=[k[0] for k in SEED_KEYS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('associations', '0012_category_global'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccountingKey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.IntegerField(unique=True)),
                ('name', models.CharField(max_length=255)),
                ('type', models.CharField(choices=[('ASSET', 'Eign'), ('LIABILITY', 'Skuld'), ('EQUITY', 'Eigið fé'), ('INCOME', 'Tekjur'), ('EXPENSE', 'Gjöld')], max_length=20)),
                ('deleted', models.BooleanField(default=False)),
            ],
            options={
                'db_table': 'associations_accountingkey',
                'ordering': ['number'],
            },
        ),
        migrations.RunPython(seed_accounting_keys, unseed_accounting_keys),
    ]
