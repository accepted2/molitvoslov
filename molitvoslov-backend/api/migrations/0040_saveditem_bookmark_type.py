from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0039_calendarfasttype_calendarday_fast_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="saveditem",
            name="save_type",
            field=models.CharField(
                choices=[
                    ("word", "Слово"),
                    ("sentence", "Предложение"),
                    ("paragraph", "Абзац"),
                    ("fragment", "Фрагмент"),
                    ("verse", "Стих"),
                    ("section", "Раздел"),
                    ("prayer", "Молитва"),
                    ("psalm", "Псалом"),
                    ("kathisma", "Кафизма"),
                    ("chapter", "Глава"),
                    ("akathist", "Акафист"),
                    ("canon", "Канон"),
                    ("text", "Текст"),
                    ("quote", "Цитата"),
                    ("bookmark", "Закладка"),
                ],
                max_length=30,
                verbose_name="Тип сохранения",
            ),
        ),
    ]
