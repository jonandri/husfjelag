from django.db import migrations


def delete_all_category_data(apps, schema_editor):
    """Clean slate: delete BudgetItems (reference Category via FK PROTECT) then Categories."""
    BudgetItem = apps.get_model("associations", "BudgetItem")
    Category = apps.get_model("associations", "Category")
    BudgetItem.objects.all().delete()
    Category.objects.all().delete()


class Migration(migrations.Migration):
    # Run outside a transaction so DELETE and ALTER TABLE don't conflict with
    # PostgreSQL deferred trigger events in the same transaction.
    atomic = False

    dependencies = [
        ("associations", "0011_hmsimportsource_landeign_stadfang"),
    ]

    operations = [
        migrations.RunPython(delete_all_category_data, migrations.RunPython.noop),
        migrations.RemoveField(model_name="category", name="association"),
    ]
