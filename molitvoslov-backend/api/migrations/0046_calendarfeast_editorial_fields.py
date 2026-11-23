from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0045_traditional_church_slavonic_titles"),
    ]

    operations = [
        migrations.AddField(
            model_name="calendarfeast",
            name="manually_edited_fields",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="prayer_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="prayer_content",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="prayer_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="prayer_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="magnification_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="magnification_content",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="magnification_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="magnification_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="source_reference",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="icon_rights_note",
            field=models.TextField(blank=True, default=""),
        ),
    ]
