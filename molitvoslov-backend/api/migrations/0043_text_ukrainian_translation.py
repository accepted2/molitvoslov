from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0042_calendarreading"),
    ]

    operations = [
        migrations.AddField(
            model_name="text",
            name="title_uk",
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name="Заголовок — украинский",
            ),
        ),
        migrations.AddField(
            model_name="text",
            name="description_uk",
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name="Краткое описание — украинский",
            ),
        ),
        migrations.AddField(
            model_name="text",
            name="translation_uk",
            field=models.TextField(
                blank=True,
                verbose_name="Украинский перевод",
            ),
        ),
        migrations.AlterField(
            model_name="text",
            name="language",
            field=models.CharField(
                choices=[
                    ("ru", "Русский"),
                    ("uk", "Украинский"),
                    ("cu", "Церковнославянский"),
                ],
                default="cu",
                max_length=10,
                verbose_name="Язык",
            ),
        ),
    ]
