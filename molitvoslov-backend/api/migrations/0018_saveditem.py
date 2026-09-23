from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        (
            'api',
            '0017_dailyquote',
        ),

        migrations.swappable_dependency(
            settings.AUTH_USER_MODEL
        ),
    ]

    operations = [
        migrations.CreateModel(
            name='SavedItem',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'save_type',
                    models.CharField(
                        choices=[
                            ('word', 'Слово'),
                            ('sentence', 'Предложение'),
                            ('paragraph', 'Абзац'),
                            ('prayer', 'Молитва'),
                            ('psalm', 'Псалом'),
                            ('kathisma', 'Кафизма'),
                            ('chapter', 'Глава'),
                            ('akathist', 'Акафист'),
                            ('text', 'Текст'),
                        ],
                        max_length=30,
                        verbose_name='Тип сохранения',
                    ),
                ),
                (
                    'source_type',
                    models.CharField(
                        max_length=50,
                        verbose_name='Тип источника',
                    ),
                ),
                (
                    'source_id',
                    models.PositiveIntegerField(
                        verbose_name='ID источника',
                    ),
                ),
                (
                    'anchor_type',
                    models.CharField(
                        max_length=50,
                        verbose_name='Тип элемента',
                    ),
                ),
                (
                    'anchor_id',
                    models.PositiveIntegerField(
                        verbose_name='ID элемента',
                    ),
                ),
                (
                    'source_title',
                    models.CharField(
                        blank=True,
                        max_length=255,
                        verbose_name='Название источника',
                    ),
                ),
                (
                    'item_title',
                    models.CharField(
                        blank=True,
                        max_length=255,
                        verbose_name='Название элемента',
                    ),
                ),
                (
                    'text',
                    models.TextField(
                        blank=True,
                        verbose_name='Сохранённый текст',
                    ),
                ),
                (
                    'start_offset',
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        verbose_name='Начало выделения',
                    ),
                ),
                (
                    'end_offset',
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        verbose_name='Конец выделения',
                    ),
                ),
                (
                    'metadata',
                    models.JSONField(
                        blank=True,
                        default=dict,
                        verbose_name='Дополнительные данные',
                    ),
                ),
                (
                    'created_at',
                    models.DateTimeField(
                        auto_now_add=True,
                        verbose_name='Сохранено',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=
                            django.db.models
                            .deletion.CASCADE,
                        related_name=
                            'saved_items',
                        to=
                            settings
                            .AUTH_USER_MODEL,
                        verbose_name=
                            'Пользователь',
                    ),
                ),
            ],
            options={
                'verbose_name':
                    'Сохранённый элемент',

                'verbose_name_plural':
                    'Сохранённые элементы',

                'ordering': [
                    '-created_at',
                ],
            },
        ),
    ]
