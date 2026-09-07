from django.db import models
from django.contrib.auth.models import User
from slugify import slugify
import re


class Category(models.Model):
    name = models.CharField(
        max_length=100,
        verbose_name='Название'
    )

    slug = models.SlugField(
        unique=True,
        verbose_name='URL-идентификатор'
    )

    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name='Родительская категория'
    )

    order = models.IntegerField(
        default=0,
        verbose_name='Порядок'
    )

    icon = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='Иконка'
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['order']
        verbose_name = 'Категория'
        verbose_name_plural = 'Категории'


class Text(models.Model):
    LANGUAGES = [
        ('ru', 'Русский'),
        ('cu', 'Церковнославянский'),
    ]

    DESCRIPTION_POSITION = [
        ('before', 'Перед молитвой'),
        ('after', 'После молитвы'),
    ]

    title = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Заголовок'
    )

    description = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Краткое описание',
        help_text='Используется для формирования URL, если заголовок пустой'
    )

    content = models.TextField(
        verbose_name='Содержание'
    )

    translation = models.TextField(
        blank=True,
        verbose_name='Русский перевод'
    )

    categories = models.ManyToManyField(
        Category,
        through='CategoryText',
        verbose_name='Категории'
    )

    language = models.CharField(
        max_length=10,
        choices=LANGUAGES,
        default='cu',
        verbose_name='Язык'
    )

    slug = models.SlugField(
        unique=True,
        verbose_name='URL-идентификатор',
        blank=True
    )

    description_position = models.CharField(
        max_length=10,
        choices=DESCRIPTION_POSITION,
        default='before',
        verbose_name='Позиция описания'
    )

    is_visible = models.BooleanField(
        default=True,
        verbose_name='Отображать'
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = self.generate_slug()

            if not base_slug:
                base_slug = 'text'

            slug = base_slug
            counter = 2

            # Позволяет существовать разным текстам
            # с одинаковыми заголовками.
            #
            # Например:
            # molitva-presvyatoj-troice
            # molitva-presvyatoj-troice-2
            while (
                    Text.objects
                            .exclude(pk=self.pk)
                            .filter(slug=slug)
                            .exists()
            ):
                slug = f'{base_slug}-{counter}'
                counter += 1

            self.slug = slug

        super().save(*args, **kwargs)

    def generate_slug(self):
        if self.title:
            base = self.title

        elif self.description:
            base = self.description

        else:
            content_clean = re.sub(
                r'^(Во имя|Слава|Аминь|Господи|Боже|Царю|Достойно|'
                r'Отче|Святый|Помилуй|Благослови|Придите|Восстав|'
                r'Ныне|Приими|Да будет|Яко|Иже|Еже|Яже|Вскую|'
                r'Како|Где|Кто|Что|Как|Когда|Почему|Зачем)'
                r'[,:;.!?]\s*',
                '',
                self.content
            )

            words = re.findall(
                r'[А-Яа-яЁёA-Za-z]+',
                content_clean
            )

            base = ' '.join(words[:7])

        return slugify(base[:80]) if base else 'text'

    def __str__(self):
        if self.title:
            return self.title

        if self.description:
            return self.description

        return self.content[:50] + '...'

    class Meta:
        verbose_name = 'Молитва / текст'
        verbose_name_plural = 'Молитвы и тексты'


class CategoryText(models.Model):
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE
    )

    text = models.ForeignKey(
        Text,
        on_delete=models.CASCADE
    )

    order = models.IntegerField(
        default=0,
        verbose_name='Порядок в категории'
    )

    class Meta:
        ordering = ['order']
        verbose_name = 'Текст в категории'
        verbose_name_plural = 'Тексты в категориях'


# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================

class PrayerRule(models.Model):
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )

    slug = models.SlugField(
        unique=True,
        verbose_name='URL-идентификатор'
    )

    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )

    is_visible = models.BooleanField(
        default=True,
        verbose_name='Отображать'
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Молитвенное правило'
        verbose_name_plural = 'Молитвенные правила'


class PrayerRuleItem(models.Model):
    TYPE_TEXT = 'text'
    TYPE_INSTRUCTION = 'instruction'
    TYPE_SECTION = 'section'

    TYPE_CHOICES = [
        (TYPE_TEXT, 'Молитва / текст'),
        (TYPE_INSTRUCTION, 'Инструкция'),
        (TYPE_SECTION, 'Раздел'),
    ]

    rule = models.ForeignKey(
        PrayerRule,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Молитвенное правило'
    )

    item_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_TEXT,
        verbose_name='Тип элемента'
    )

    # Заполняется только если item_type == text.
    #
    # Один и тот же Text можно использовать
    # в разных молитвенных правилах.
    text = models.ForeignKey(
        Text,
        on_delete=models.CASCADE,
        related_name='prayer_rule_items',
        null=True,
        blank=True,
        verbose_name='Текст'
    )

    # В основном нужен для section.
    title = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Заголовок'
    )

    # Используется для instruction.
    #
    # Например:
    # "От Пасхи до Вознесения вместо этой молитвы..."
    content = models.TextField(
        blank=True,
        verbose_name='Содержимое'
    )

    # Примечание именно к этому месту правила.
    #
    # Например:
    # "(Читается трижды...)"
    note = models.TextField(
        blank=True,
        verbose_name='Примечание'
    )

    order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок'
    )

    footnotes = models.ManyToManyField(
        'PrayerRuleFootnote',
        blank=True,
        related_name='items',
        verbose_name='Сноски'
    )

    def __str__(self):
        if self.item_type == self.TYPE_TEXT and self.text:
            return f'{self.rule}: {self.text}'

        if self.item_type == self.TYPE_SECTION:
            return f'{self.rule}: {self.title}'

        if self.item_type == self.TYPE_INSTRUCTION:
            return f'{self.rule}: {self.content[:50]}'

        return f'{self.rule}: элемент {self.order}'

    class Meta:
        ordering = ['order']

        verbose_name = 'Элемент молитвенного правила'
        verbose_name_plural = 'Элементы молитвенных правил'

        constraints = [
            models.UniqueConstraint(
                fields=['rule', 'order'],
                name='unique_order_per_prayer_rule'
            ),

            # Если это молитва/текст — ссылка на Text обязательна.
            #
            # Если instruction/section —
            # ссылка на Text должна отсутствовать.
            models.CheckConstraint(
                condition=(
                        models.Q(
                            item_type='text',
                            text__isnull=False
                        )
                        |
                        models.Q(
                            item_type__in=['instruction', 'section'],
                            text__isnull=True
                        )
                ),
                name='prayer_rule_item_type_consistency'
            ),
        ]


class PrayerRuleFootnote(models.Model):
    rule = models.ForeignKey(
        PrayerRule,
        on_delete=models.CASCADE,
        related_name='footnotes',
        verbose_name='Молитвенное правило'
    )

    number = models.PositiveIntegerField(
        verbose_name='Номер'
    )

    content = models.TextField(
        verbose_name='Текст сноски'
    )

    def __str__(self):
        return f'[{self.number}] {self.content[:60]}'

    class Meta:
        ordering = ['number']

        verbose_name = 'Сноска молитвенного правила'
        verbose_name_plural = 'Сноски молитвенных правил'

        constraints = [
            models.UniqueConstraint(
                fields=['rule', 'number'],
                name='unique_footnote_per_prayer_rule'
            )
        ]


# =========================================================
# ПСАЛТИРЬ
# =========================================================

class Psalter(models.Model):
    name = models.CharField(max_length=255, verbose_name='Название')
    slug = models.SlugField(unique=True, verbose_name='Url-индетификатор')

    description = models.TextField(blank=True, verbose_name='Описание')
    is_visible = models.BooleanField(default=True, verbose_name='Отображать')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Псалтирь'
        verbose_name_plural = 'Псалтири'

class Kathisma(models.Model):
    psalter = models.ForeignKey(Psalter, on_delete=models.CASCADE, related_name='kathismas',verbose_name='Псалтирь')
    number = models.PositiveIntegerField(verbose_name='Номер кафизмы')
    title = models.CharField(max_length=255, blank=True,verbose_name='Название')

    def __str__(self):
        return f'Кафизма {self.number}'

    class Meta:
        ordering = ['number']
        verbose_name= 'Кафизма'
        verbose_name_plural='Кафизмы'

        constraints = [
            models.UniqueConstraint(
                fields = ['psalter','number'],
                name='unique_kathisma_per_psalter'
            )
        ]

class Psalm(models.Model):
    kathisma = models.ForeignKey(Kathisma,on_delete=models.CASCADE,related_name='psalms',verbose_name='Кафизма' )
    number = models.PositiveIntegerField(unique=True, verbose_name='Номер псалма')
    title_church_slavonic =models.CharField(max_length=500,blank=True,verbose_name='Заголовок на церковнославянском')
    title_russian = models.CharField(max_length=500,blank=True,verbose_name='Заголовок на русском')
    description = models.TextField(blank=True, verbose_name='Краткое описание псалма')

    def __str__(self):
        return f'Псалом {self.number}'

    class Meta:
        ordering = ['number']
        verbose_name = 'Псалом'
        verbose_name_plural = 'Псалмы'

class PsalmVerse(models.Model):
    psalm = models.ForeignKey(Psalm, on_delete=models.CASCADE,related_name='verses',verbose_name='Псалом')
    number = models.PositiveIntegerField(verbose_name='Номер стиха')
    church_slavonic = models.TextField(verbose_name='Церковнославянский текст')
    russian = models.TextField(blank=True, verbose_name='Русский текст')

    def __str__(self):
        return f'Псалом {self.psalm.number}, стих {self.number}'

    class Meta:
        ordering = ['number']
        verbose_name = 'Стих псалма'
        verbose_name_plural = 'Стихи псалмов'

        constraints = [
            models.UniqueConstraint(
                fields=['psalm','number'],
                name = 'unique_verse_per_psalm'
            )
        ]

class KathismaGlory(models.Model):
    kathisma = models.ForeignKey(Kathisma,on_delete=models.CASCADE,related_name='glories', verbose_name='Кафизма')
    number = models.PositiveIntegerField(verbose_name='Номер Славы')
    after_psalm = models.ForeignKey(Psalm,on_delete=models.CASCADE,null=True,blank=True,related_name='glories_after',verbose_name='После псалма')
    after_verse = models.ForeignKey(PsalmVerse,on_delete=models.CASCADE,null=True,blank=True,related_name='glories_after',verbose_name='После стиха')

    def __str__(self):
        return (
            f'Кафизма {self.kathisma.number},'
            f'Слава {self.number}'
        )

    class Meta:
        ordering = ['number']

        verbose_name = 'Слава кафизмы'
        verbose_name_plural = 'Славы кафизм'

        constraints = [
            models.UniqueConstraint(
                fields=['kathisma','number'],
                name = 'unique_glory_per_kathisma'
            ),
        models.CheckConstraint(
            condition=(
                models.Q(
                    after_psalm__isnull=False,
                    after_verse__isnull=True,
                )
                |
                models.Q(
                    after_psalm__isnull=True,
                    after_verse__isnull=False
                )
            ),
            name='kathisma_glory_position_required'
        ),
        ]



class UserCollection(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )

    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )

    is_default = models.BooleanField(
        default=False,
        verbose_name='Сборник по умолчанию'
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f'{self.user.username}: {self.name}'

    class Meta:
        verbose_name = 'Пользовательский сборник'
        verbose_name_plural = 'Пользовательские сборники'


class CollectionItem(models.Model):
    collection = models.ForeignKey(
        UserCollection,
        on_delete=models.CASCADE
    )

    text = models.ForeignKey(
        Text,
        on_delete=models.CASCADE
    )

    order = models.IntegerField(
        default=0,
        verbose_name='Порядок в сборнике'
    )

    added_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ['order']

        unique_together = [
            'collection',
            'text'
        ]

        verbose_name = 'Текст в сборнике'
        verbose_name_plural = 'Тексты в сборниках'


class Bookmark(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    text = models.ForeignKey(
        Text,
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )

    collection = models.ForeignKey(
        UserCollection,
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )

    position = models.IntegerField(
        default=0,
        verbose_name='Позиция в тексте'
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f'{self.user.username}: {self.text or self.collection}'

    class Meta:
        verbose_name = 'Закладка'
        verbose_name_plural = 'Закладки'