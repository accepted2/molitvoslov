from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def enable_rls(apps, schema_editor):
    # Supabase exposes public-schema tables through its Data API when granted.
    # Django connects as the table owner; deny direct API row access by default.
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(
            "ALTER TABLE api_accountpreferences ENABLE ROW LEVEL SECURITY"
        )
        # This table is only accessed by authenticated Django on Render,
        # not by the public Supabase Data API. Explicitly revoke direct
        # client role privileges even on projects with broad default grants.
        # Avoid anonymous PL/pgSQL DO blocks: malformed dollar quoting
        # can abort the entire atomic migration on PostgreSQL. Check whether
        # Supabase's optional client roles exist, then revoke only those roles.
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                "SELECT rolname FROM pg_roles "
                "WHERE rolname IN ('anon', 'authenticated')"
            )
            existing_roles = {row[0] for row in cursor.fetchall()}

        for role in ("anon", "authenticated"):
            if role in existing_roles:
                schema_editor.execute(
                    f'REVOKE ALL PRIVILEGES ON TABLE "public"."api_accountpreferences" FROM "{role}"'
                )


def disable_rls(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(
            "ALTER TABLE api_accountpreferences DISABLE ROW LEVEL SECURITY"
        )


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
        migrations.RunPython(enable_rls, disable_rls),
    ]
