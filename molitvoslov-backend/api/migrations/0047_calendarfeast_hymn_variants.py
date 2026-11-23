from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0046_calendarfeast_editorial_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="calendarfeast",
            name="troparion_alt_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="troparion_alt_content",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="troparion_alt_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="troparion_alt_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="kontakion_alt_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="kontakion_alt_content",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="kontakion_alt_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="kontakion_alt_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
    ]
