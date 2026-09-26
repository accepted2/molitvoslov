from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_canon_canonsection_saveditem_canon'),
    ]

    operations = [
        migrations.CreateModel(
            name='BibleTranslation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(unique=True, verbose_name='Код перевода')),
                ('name', models.CharField(max_length=255, verbose_name='Название')),
                ('language', models.CharField(default='ru', max_length=10, verbose_name='Язык')),
                ('source_url', models.URLField(blank=True, verbose_name='Источник')),
                ('source_revision', models.CharField(blank=True, max_length=64, verbose_name='Ревизия источника')),
                ('license_name', models.CharField(blank=True, max_length=100, verbose_name='Лицензия')),
                ('is_visible', models.BooleanField(default=True, verbose_name='Отображать')),
            ],
            options={
                'verbose_name': 'Перевод Библии',
                'verbose_name_plural': 'Переводы Библии',
            },
        ),
        migrations.CreateModel(
            name='BibleBook',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('testament', models.CharField(choices=[('old', 'Ветхий Завет'), ('new', 'Новый Завет')], max_length=10, verbose_name='Завет')),
                ('section', models.CharField(choices=[('old', 'Ветхий Завет'), ('gospels', 'Евангелия'), ('acts', 'Деяния'), ('epistles', 'Послания'), ('revelation', 'Апокалипсис')], max_length=20, verbose_name='Раздел')),
                ('code', models.CharField(max_length=8, verbose_name='USFM-код')),
                ('name', models.CharField(max_length=255, verbose_name='Полное название')),
                ('short_name', models.CharField(max_length=100, verbose_name='Краткое название')),
                ('slug', models.SlugField(max_length=100, verbose_name='URL-идентификатор')),
                ('canonical_order', models.PositiveSmallIntegerField(verbose_name='Канонический порядок')),
                ('is_appendix', models.BooleanField(default=False, help_text='Используется для машинной структуры источника, например для отдельно вынесенной Молитвы Манассии.', verbose_name='Отдельная дополнительная единица источника')),
                ('translation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='books', to='api.bibletranslation', verbose_name='Перевод')),
            ],
            options={
                'verbose_name': 'Книга Библии',
                'verbose_name_plural': 'Книги Библии',
                'ordering': ['canonical_order'],
            },
        ),
        migrations.CreateModel(
            name='BibleChapter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.PositiveSmallIntegerField(verbose_name='Номер главы')),
                ('book', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chapters', to='api.biblebook', verbose_name='Книга')),
            ],
            options={
                'verbose_name': 'Глава Библии',
                'verbose_name_plural': 'Главы Библии',
                'ordering': ['number'],
            },
        ),
        migrations.CreateModel(
            name='BibleVerse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.PositiveSmallIntegerField(verbose_name='Номер стиха')),
                ('text', models.TextField(verbose_name='Текст')),
                ('chapter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='verses', to='api.biblechapter', verbose_name='Глава')),
            ],
            options={
                'verbose_name': 'Стих Библии',
                'verbose_name_plural': 'Стихи Библии',
                'ordering': ['number'],
            },
        ),
        migrations.AddConstraint(
            model_name='biblebook',
            constraint=models.UniqueConstraint(fields=('translation', 'code'), name='unique_bible_book_code_per_translation'),
        ),
        migrations.AddConstraint(
            model_name='biblebook',
            constraint=models.UniqueConstraint(fields=('translation', 'slug'), name='unique_bible_book_slug_per_translation'),
        ),
        migrations.AddConstraint(
            model_name='biblebook',
            constraint=models.UniqueConstraint(fields=('translation', 'canonical_order'), name='unique_bible_book_order_per_translation'),
        ),
        migrations.AddConstraint(
            model_name='biblechapter',
            constraint=models.UniqueConstraint(fields=('book', 'number'), name='unique_bible_chapter_per_book'),
        ),
        migrations.AddConstraint(
            model_name='bibleverse',
            constraint=models.UniqueConstraint(fields=('chapter', 'number'), name='unique_bible_verse_per_chapter'),
        ),
    ]
