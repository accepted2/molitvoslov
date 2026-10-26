"""Align migration state with current content models.

No data migrations or deletions. The three identifier/content alterations are
metadata-only for existing compatible databases; CalendarReading gains the
supported Old Testament choice.
"""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0046_offline_content_updates"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calendarreading",
            name="kind",
            field=models.CharField(
                choices=[
                    ("gospel", "Евангелие"),
                    ("apostle", "Апостол"),
                    ("old_testament", "Ветхий Завет"),
                ],
                db_index=True, max_length=16, verbose_name="Тип",
            ),
        ),
        migrations.AlterField(
            model_name="offlinecontentchange",
            name="id",
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
        ),
        migrations.AlterField(
            model_name="offlinecontentsnapshot",
            name="id",
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
        ),
        migrations.AlterField(
            model_name="text",
            name="content",
            field=models.TextField(verbose_name="Церковнославянский текст"),
        ),
    ]
