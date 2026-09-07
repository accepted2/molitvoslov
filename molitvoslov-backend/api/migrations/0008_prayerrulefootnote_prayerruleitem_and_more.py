# Generated manually after Django 6.1 migration correction

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_alter_categorytext_options_and_more'),
    ]

    operations = [

        # =====================================================
        # 1. Переименовываем существующие модели
        # =====================================================

        migrations.RenameModel(
            old_name='Rule',
            new_name='PrayerRule',
        ),

        migrations.RenameModel(
            old_name='RuleItem',
            new_name='PrayerRuleItem',
        ),

        # =====================================================
        # 2. Убираем старое ограничение RuleItem
        # =====================================================

        migrations.RemoveConstraint(
            model_name='prayerruleitem',
            name='unique_order_per_rule',
        ),

        # =====================================================
        # 3. Остальные небольшие изменения
        # =====================================================

        migrations.AlterModelOptions(
            name='bookmark',
            options={
                'verbose_name': 'Закладка',
                'verbose_name_plural': 'Закладки',
            },
        ),

        migrations.AlterField(
            model_name='category',
            name='slug',
            field=models.SlugField(
                unique=True,
                verbose_name='URL-идентификатор',
            ),
        ),

        migrations.AlterField(
            model_name='text',
            name='slug',
            field=models.SlugField(
                blank=True,
                unique=True,
                verbose_name='URL-идентификатор',
            ),
        ),

        # =====================================================
        # 4. Расширяем существующий PrayerRuleItem
        # =====================================================

        migrations.AddField(
            model_name='prayerruleitem',
            name='item_type',
            field=models.CharField(
                choices=[
                    ('text', 'Молитва / текст'),
                    ('instruction', 'Инструкция'),
                    ('section', 'Раздел'),
                ],
                default='text',
                max_length=20,
                verbose_name='Тип элемента',
            ),
        ),

        migrations.AddField(
            model_name='prayerruleitem',
            name='title',
            field=models.CharField(
                blank=True,
                default='',
                max_length=255,
                verbose_name='Заголовок',
            ),
            preserve_default=False,
        ),

        migrations.AddField(
            model_name='prayerruleitem',
            name='content',
            field=models.TextField(
                blank=True,
                default='',
                verbose_name='Содержимое',
            ),
            preserve_default=False,
        ),

        # FK rule уже существует после RenameModel.
        # Просто приводим его к новому описанию.
        migrations.AlterField(
            model_name='prayerruleitem',
            name='rule',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='items',
                to='api.prayerrule',
                verbose_name='Молитвенное правило',
            ),
        ),

        # Старые RuleItem всегда имели Text.
        # Теперь делаем поле nullable для instruction/section.
        migrations.AlterField(
            model_name='prayerruleitem',
            name='text',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='prayer_rule_items',
                to='api.text',
                verbose_name='Текст',
            ),
        ),

        # =====================================================
        # 5. Создаём сноски уже ПОСЛЕ появления PrayerRule
        # =====================================================

        migrations.CreateModel(
            name='PrayerRuleFootnote',
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
                    'number',
                    models.PositiveIntegerField(
                        verbose_name='Номер',
                    ),
                ),

                (
                    'content',
                    models.TextField(
                        verbose_name='Текст сноски',
                    ),
                ),

                (
                    'rule',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='footnotes',
                        to='api.prayerrule',
                        verbose_name='Молитвенное правило',
                    ),
                ),
            ],

            options={
                'verbose_name': 'Сноска молитвенного правила',
                'verbose_name_plural': 'Сноски молитвенных правил',
                'ordering': ['number'],
            },
        ),

        # =====================================================
        # 6. Новые ограничения
        # =====================================================

        migrations.AddConstraint(
            model_name='prayerruleitem',
            constraint=models.UniqueConstraint(
                fields=('rule', 'order'),
                name='unique_order_per_prayer_rule',
            ),
        ),

        migrations.AddConstraint(
            model_name='prayerruleitem',
            constraint=models.CheckConstraint(
                condition=(
                        models.Q(
                            item_type='text',
                            text__isnull=False,
                        )
                        |
                        models.Q(
                            item_type__in=[
                                'instruction',
                                'section',
                            ],
                            text__isnull=True,
                        )
                ),
                name='prayer_rule_item_type_consistency',
            ),
        ),

        migrations.AddConstraint(
            model_name='prayerrulefootnote',
            constraint=models.UniqueConstraint(
                fields=('rule', 'number'),
                name='unique_footnote_per_prayer_rule',
            ),
        ),
    ]