from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0051_accountdeletionrequest"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="SharedContentInvitation",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("token_hash", models.CharField(max_length=64, db_index=True, unique=True)),
                ("kind", models.CharField(max_length=20, choices=[
                    ("quote", "Цитата"), ("memorial", "Помянник"),
                    ("prayerbook", "Личный молитвослов"),
                ])),
                ("title", models.CharField(max_length=180)),
                ("snapshot", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(null=True, blank=True)),
                ("revoked_at", models.DateTimeField(null=True, blank=True)),
                ("owner", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="shared_content_invitations",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="SharedContentImport",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("kind", models.CharField(max_length=20)),
                ("imported_sync_id", models.UUIDField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("invitation", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="imports", to="api.sharedcontentinvitation",
                )),
                ("recipient", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="content_imports", to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.AddConstraint(
            model_name="sharedcontentimport",
            constraint=models.UniqueConstraint(
                fields=("invitation", "recipient"),
                name="unique_shared_content_import",
            ),
        ),
    ]
