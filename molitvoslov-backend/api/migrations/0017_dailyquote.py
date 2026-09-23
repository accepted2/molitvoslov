from django.db import migrations, models


def add_initial_quotes(apps, schema_editor):
    DailyQuote = apps.get_model(
        'api',
        'DailyQuote',
    )

    quotes = [
        {
            'text': (
                'Всегда радуйтесь. Непрестанно молитесь. '
                'За все благодарите: ибо такова о вас воля '
                'Божия во Христе Иисусе.'
            ),
            'source': 'Священное Писание',
            'reference': '1 Фес. 5:16–18',
            'order': 1,
        },
        {
            'text': (
                'Сердце чистое сотвори во мне, Боже, '
                'и дух правый обнови внутри меня.'
            ),
            'source': 'Священное Писание',
            'reference': 'Пс. 50:12',
            'order': 2,
        },
        {
            'text': (
                'Придите ко Мне все труждающиеся '
                'и обремененные, и Я успокою вас.'
            ),
            'source': 'Священное Писание',
            'reference': 'Мф. 11:28',
            'order': 3,
        },
        {
            'text': (
                'Мир оставляю вам, мир Мой даю вам; '
                'не так, как мир дает, Я даю вам. '
                'Да не смущается сердце ваше и да не устрашается.'
            ),
            'source': 'Священное Писание',
            'reference': 'Ин. 14:27',
            'order': 4,
        },
        {
            'text': (
                'Все могу в укрепляющем меня '
                'Иисусе Христе.'
            ),
            'source': 'Священное Писание',
            'reference': 'Флп. 4:13',
            'order': 5,
        },
        {
            'text': (
                'Слово Твое – светильник ноге моей '
                'и свет стезе моей.'
            ),
            'source': 'Священное Писание',
            'reference': 'Пс. 118:105',
            'order': 6,
        },
        {
            'text': (
                'Утешайтесь надеждою; в скорби будьте терпеливы, '
                'в молитве постоянны.'
            ),
            'source': 'Священное Писание',
            'reference': 'Рим. 12:12',
            'order': 7,
        },
    ]

    for quote in quotes:
        DailyQuote.objects.get_or_create(
            reference=quote['reference'],
            defaults=quote,
        )


def remove_initial_quotes(apps, schema_editor):
    DailyQuote = apps.get_model(
        'api',
        'DailyQuote',
    )

    DailyQuote.objects.filter(
        reference__in=[
            '1 Фес. 5:16–18',
            'Пс. 50:12',
            'Мф. 11:28',
            'Ин. 14:27',
            'Флп. 4:13',
            'Пс. 118:105',
            'Рим. 12:12',
        ]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        (
            'api',
            '0016_akathist_kontakion_before_akathist_troparion_and_more',
        ),
    ]

    operations = [
        migrations.CreateModel(
            name='DailyQuote',
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
                    'text',
                    models.TextField(
                        verbose_name='Текст цитаты',
                    ),
                ),
                (
                    'source',
                    models.CharField(
                        blank=True,
                        max_length=255,
                        verbose_name='Источник / автор',
                    ),
                ),
                (
                    'reference',
                    models.CharField(
                        blank=True,
                        max_length=255,
                        verbose_name='Ссылка на источник',
                    ),
                ),
                (
                    'quote_date',
                    models.DateField(
                        blank=True,
                        help_text=(
                            'Если дата не указана, цитата участвует '
                            'в ежедневной автоматической ротации.'
                        ),
                        null=True,
                        unique=True,
                        verbose_name='Дата показа',
                    ),
                ),
                (
                    'is_active',
                    models.BooleanField(
                        default=True,
                        verbose_name='Активна',
                    ),
                ),
                (
                    'order',
                    models.PositiveIntegerField(
                        default=0,
                        verbose_name='Порядок',
                    ),
                ),
                (
                    'created_at',
                    models.DateTimeField(
                        auto_now_add=True,
                        verbose_name='Создано',
                    ),
                ),
            ],
            options={
                'verbose_name':
                    'Цитата дня',

                'verbose_name_plural':
                    'Цитаты дня',

                'ordering': [
                    'quote_date',
                    'order',
                    'id',
                ],
            },
        ),
        migrations.RunPython(
            add_initial_quotes,
            remove_initial_quotes,
        ),
    ]
