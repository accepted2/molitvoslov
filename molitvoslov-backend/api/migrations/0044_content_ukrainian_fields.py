from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0043_text_ukrainian_translation"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="name_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=100,
                verbose_name="Название — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="prayerrule",
            name="name_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Название — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="prayerrule",
            name="description_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Описание — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="prayerruleitem",
            name="title_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Заголовок — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="prayerruleitem",
            name="content_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Содержимое — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="prayerruleitem",
            name="note_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Примечание — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="prayerrulefootnote",
            name="content_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Текст сноски — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="akathist",
            name="title_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Название — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="akathist",
            name="description_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Описание — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="akathistsection",
            name="note_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Примечание — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="canon",
            name="title_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Название — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="canon",
            name="description_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Описание — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="canonsection",
            name="heading_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Заголовок / метка — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalter",
            name="name_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Название — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalter",
            name="description_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Описание — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalter",
            name="prayers_before_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Молитвы перед чтением Псалтири — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalter",
            name="prayers_after_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Молитвы после чтения Псалтири — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="kathisma",
            name="title_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Название — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="kathisma",
            name="prayers_after_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Молитвы после кафизмы — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalm",
            name="title_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=500,
                verbose_name="Заголовок на украинском",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalm",
            name="description_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Краткое описание псалма — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="psalmverse",
            name="ukrainian",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Украинский текст",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="dailyquote",
            name="text_uk",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="Текст цитаты — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="dailyquote",
            name="source_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Источник / автор — украинский",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="dailyquote",
            name="reference_uk",
            field=models.CharField(
                blank=True,
                default="",
                max_length=255,
                verbose_name="Ссылка на источник — украинский",
            ),
            preserve_default=False,
        ),
    ]
