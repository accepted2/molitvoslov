import uuid

from django.db import migrations, models
import django.db.models.deletion


READING_NAMESPACE = uuid.UUID("3c0fb321-6c5b-43cf-a1f1-5d5b2b87964f")


def deterministic_uid(day, kind, title, order):
    key = f"{day.date_gregorian.isoformat()}:{kind}:{order}:{title.strip()}"
    return uuid.uuid5(READING_NAMESPACE, key)


def forwards(apps, schema_editor):
    CalendarDay = apps.get_model("api", "CalendarDay")
    CalendarReading = apps.get_model("api", "CalendarReading")

    for day in CalendarDay.objects.all().iterator():
        legacy = [
            ("gospel", (day.gospel_title or "").strip()),
            ("apostle", (day.apostolic_title or "").strip()),
        ]

        for kind, title in legacy:
            if not title:
                continue

            CalendarReading.objects.get_or_create(
                sync_uid=deterministic_uid(day, kind, title, 0),
                defaults={
                    "day_id": day.pk,
                    "kind": kind,
                    "label": "",
                    "title": title,
                    "order": 0,
                },
            )


def backwards(apps, schema_editor):
    CalendarReading = apps.get_model("api", "CalendarReading")
    CalendarReading.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0041_traditional_text_and_misc_prayers"),
    ]

    operations = [
        migrations.CreateModel(
            name="CalendarReading",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sync_uid",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "kind",
                    models.CharField(
                        choices=[("gospel", "Евангелие"), ("apostle", "Апостол")],
                        db_index=True,
                        max_length=16,
                        verbose_name="Тип",
                    ),
                ),
                (
                    "label",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text=(
                            "Необязательно: например «Ряд.», " "«Субботы по Воздвижении», «Вмч.»"
                        ),
                        max_length=255,
                        verbose_name="Подпись",
                    ),
                ),
                (
                    "title",
                    models.TextField(
                        help_text=(
                            "Одна ссылка на чтение, например «1 Кор. 1:26-29». "
                            "Одинакова для RU и UK."
                        ),
                        verbose_name="Ссылка на чтение",
                    ),
                ),
                (
                    "order",
                    models.PositiveSmallIntegerField(
                        default=0,
                        verbose_name="Порядок",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "day",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="readings",
                        to="api.calendarday",
                        verbose_name="Календарный день",
                    ),
                ),
            ],
            options={
                "verbose_name": "Календарь: чтение",
                "verbose_name_plural": "Календарь: чтения",
                "ordering": ["kind", "order", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="calendarreading",
            index=models.Index(
                fields=["day", "kind", "order"],
                name="api_calread_day_kind_ord_idx",
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
