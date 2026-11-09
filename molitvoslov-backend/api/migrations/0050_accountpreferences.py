from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0049_compact_content_baseline"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountPreferences",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("settings", models.JSONField(blank=True, default=dict)),
                ("reader_overrides", models.JSONField(blank=True, default=dict)),
                ("reader_modes", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="app_preferences", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Настройки приложения",
                "verbose_name_plural": "Настройки приложения",
            },
        ),
    ]
