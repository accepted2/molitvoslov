from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0036_calendar_text_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="calendarfeast",
            name="title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="short_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="troparion_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="troparion_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="kontakion_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="kontakion_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="life_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="life_content_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarfeast",
            name="description_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="fast_type_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="fast_name_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="fast_description_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="summary_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="short_summary_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="gospel_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="gospel_reading_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="apostolic_title_uk",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="calendarday",
            name="apostolic_reading_uk",
            field=models.TextField(blank=True, default=""),
        ),
    ]
