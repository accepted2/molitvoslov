from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0045_traditional_church_slavonic_titles")]

    operations = [
        migrations.CreateModel(
            name="OfflineContentSnapshot",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("section", models.CharField(max_length=24)),
                ("object_key", models.CharField(max_length=200)),
                ("checksum", models.CharField(max_length=64)),
                ("payload", models.JSONField()),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"indexes": [models.Index(fields=["section", "object_key"], name="api_oc_snap_section_idx")]},
        ),
        migrations.AddConstraint(
            model_name="offlinecontentsnapshot",
            constraint=models.UniqueConstraint(fields=("section", "object_key"), name="unique_offline_content_object"),
        ),
        migrations.CreateModel(
            name="OfflineContentChange",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("section", models.CharField(max_length=24)),
                ("object_key", models.CharField(max_length=200)),
                ("operation", models.CharField(max_length=8, choices=[("upsert", "Upsert"), ("delete", "Delete")])),
                ("payload", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["id"], "indexes": [models.Index(fields=["section", "object_key"], name="api_oc_change_section_idx")]},
        ),
    ]
