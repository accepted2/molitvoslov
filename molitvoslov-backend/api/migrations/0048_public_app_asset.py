from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0047_align_content_models")]

    operations = [
        migrations.CreateModel(
            name="PublicAppAsset",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(max_length=100, unique=True)),
                ("image_url", models.URLField(blank=True, max_length=2048)),
                ("title", models.CharField(blank=True, max_length=255)),
                ("enabled", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["key"],
                "verbose_name": "Ресурс приложения",
                "verbose_name_plural": "Ресурсы приложения",
            },
        ),
    ]
