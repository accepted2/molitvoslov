from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("api", "0048_public_app_asset")]

    operations = [
        migrations.AlterField(
            model_name="offlinecontentsnapshot",
            name="payload",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
