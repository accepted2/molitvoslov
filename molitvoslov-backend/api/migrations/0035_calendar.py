from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0034_personal_prayer_books"),
    ]

    operations = [
        migrations.CreateModel(
            name="CalendarFeast",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("source_id", models.PositiveIntegerField(db_index=True, unique=True)),
                ("date_type", models.CharField(blank=True, default="", max_length=20)),
                ("celebration_type", models.CharField(blank=True, default="", max_length=20)),
                ("celebration_rank", models.CharField(blank=True, default="", max_length=30)),
                ("title", models.CharField(max_length=500)),
                ("short_title", models.CharField(blank=True, default="", max_length=160)),
                ("julian_month", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("julian_day", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("easter_offset", models.IntegerField(blank=True, null=True)),
                ("icon_url", models.URLField(blank=True, default="", max_length=1000)),
                ("troparion_title", models.CharField(blank=True, default="", max_length=500)),
                ("troparion_content", models.TextField(blank=True, default="")),
                ("troparion_echo", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("kontakion_title", models.CharField(blank=True, default="", max_length=500)),
                ("kontakion_content", models.TextField(blank=True, default="")),
                ("kontakion_echo", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("life_title", models.CharField(blank=True, default="", max_length=500)),
                ("life_content", models.TextField(blank=True, default="")),
                ("description", models.TextField(blank=True, default="")),
                ("all_dates", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Календарь: святой / праздник",
                "verbose_name_plural": "Календарь: святые / праздники",
                "ordering": ["title"],
            },
        ),
        migrations.CreateModel(
            name="CalendarDay",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("date_gregorian", models.DateField(db_index=True, unique=True)),
                ("julian_month", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("julian_day", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("fast_type_code", models.CharField(blank=True, default="", max_length=50)),
                ("fast_type_title", models.CharField(blank=True, default="", max_length=200)),
                ("fast_name", models.CharField(blank=True, default="", max_length=200)),
                ("fast_description", models.CharField(blank=True, default="", max_length=250)),
                ("summary", models.CharField(blank=True, default="", max_length=700)),
                ("short_summary", models.CharField(blank=True, default="", max_length=350)),
                ("gospel_title", models.CharField(blank=True, default="", max_length=500)),
                ("gospel_reading", models.TextField(blank=True, default="")),
                ("apostolic_title", models.CharField(blank=True, default="", max_length=500)),
                ("apostolic_reading", models.TextField(blank=True, default="")),
                ("source_payload", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "main_feast",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="main_days",
                        to="api.calendarfeast",
                    ),
                ),
                (
                    "feasts",
                    models.ManyToManyField(
                        blank=True,
                        related_name="calendar_days",
                        to="api.calendarfeast",
                    ),
                ),
            ],
            options={
                "verbose_name": "Календарь: день",
                "verbose_name_plural": "Календарь: дни",
                "ordering": ["date_gregorian"],
            },
        ),
    ]
