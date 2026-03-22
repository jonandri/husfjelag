from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('users', '0002_alter_user_email_alter_user_phone'),
    ]
    operations = [
        migrations.AddField(
            model_name='user',
            name='is_superadmin',
            field=models.BooleanField(default=False),
        ),
    ]
