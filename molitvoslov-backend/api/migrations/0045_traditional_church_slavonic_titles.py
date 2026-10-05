from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0044_content_ukrainian_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="text",
            name="traditional_title",
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name="Заголовок — церковнославянский традиционный",
            ),
        ),
        migrations.AddField(
            model_name="prayerrule",
            name="traditional_name",
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name="Название — церковнославянское традиционное",
            ),
        ),
    ]
