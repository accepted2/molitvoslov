from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0035_calendar"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calendarfeast",
            name="title",
            field=models.TextField(),
        ),
        migrations.AlterField(
            model_name="calendarfeast",
            name="short_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarfeast",
            name="troparion_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarfeast",
            name="kontakion_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarfeast",
            name="life_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="fast_type_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="fast_name",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="fast_description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="summary",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="short_summary",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="gospel_title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="calendarday",
            name="apostolic_title",
            field=models.TextField(blank=True, default=""),
        ),
    ]
