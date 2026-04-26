from django.db import migrations

NEW_KEYS = [
    (4900, "Vaxtatekjur", "INCOME"),
    (5700, "Viðhald & Viðgerðir", "EXPENSE"),
    (5900, "Vaxtagjöld", "EXPENSE"),
    (5910, "Fjármagnstekjuskattur", "EXPENSE"),
]


def seed(apps, schema_editor):
    AccountingKey = apps.get_model("associations", "AccountingKey")
    for number, name, type_ in NEW_KEYS:
        AccountingKey.objects.get_or_create(
            number=number, defaults={"name": name, "type": type_}
        )


def unseed(apps, schema_editor):
    AccountingKey = apps.get_model("associations", "AccountingKey")
    AccountingKey.objects.filter(number__in=[k[0] for k in NEW_KEYS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("associations", "0024_fix_registrationrequest_status_maxlength"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
