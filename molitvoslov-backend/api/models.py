from django.db import models
from django.contrib.auth.models import User
from slugify import slugify
import re
from django.conf import settings


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
# АКАФИСТЫ
# =========================================================

class Akathist(models.Model):
    title = models.CharField(
        max_length=255,
        verbose_name='Название',
    )
    slug = models.SlugField(
        unique=True,
        verbose_name='URL-идентификатор',
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание',
    )
    is_visible = models.BooleanField(
        default=True,
        verbose_name='Отображать',
    )
    troparion = models.ForeignKey(
        Text,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='akathists_as_troparion',
        verbose_name='Тропарь перед акафистом',
    )
    kontakion_before = models.ForeignKey(
        Text,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='akathists_as_kontakion_before',
        verbose_name='Кондак перед акафистом',
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = 'Акафист'
        verbose_name_plural = 'Акафисты'

class AkathistReadingRule(models.Model):
    key = models.CharField(
        max_length=50,
        unique=True,
        default='default',
        verbose_name='Ключ',
    )

    opening = models.ForeignKey(
        Text,
        on_delete=models.PROTECT,
        related_name='akathist_opening_rules',
        verbose_name='Общее начало акафиста',
    )

    ending = models.ForeignKey(
        Text,
        on_delete=models.PROTECT,
        related_name='akathist_ending_rules',
        verbose_name='Общее окончание акафиста',
    )

    def __str__(self):
        return 'Общий чин чтения акафиста'

    class Meta:
        verbose_name = 'Общий чин чтения акафиста'
        verbose_name_plural = 'Общий чин чтения акафиста'

class AkathistSection(models.Model):
    TYPE_KONTAKION = 'kontakion'
    TYPE_IKOS = 'ikos'
    TYPE_PRAYER = 'prayer'

    TYPE_CHOICES = [
        (
            TYPE_KONTAKION,
            'Кондак'
        ),
        (
            TYPE_IKOS,
            'Икос'
        ),
        (
            TYPE_PRAYER,
            'Молитва'
        ),
    ]

    akathist = models.ForeignKey(
        Akathist,
        on_delete=models.CASCADE,
        related_name='sections',
        verbose_name='Акафист'
    )

    section_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        verbose_name='Тип раздела'
    )

    number = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Номер'
    )

    text = models.ForeignKey(
        Text,
        on_delete=models.PROTECT,
        related_name='akathist_sections',
        verbose_name='Текст'
    )

    note = models.TextField(
        blank=True,
        verbose_name='Примечание'
    )

    order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок'
    )

    def __str__(self):
        if self.number:
            return (
                f'{self.akathist}: '
                f'{self.get_section_type_display()} '
                f'{self.number}'
            )

        return (
            f'{self.akathist}: '
            f'{self.get_section_type_display()}'
        )

    class Meta:
        ordering = ['order']

        verbose_name = 'Раздел акафиста'
        verbose_name_plural = 'Разделы акафиста'

        constraints = [
            models.UniqueConstraint(
                fields=[
                    'akathist',
                    'order',
                ],
                name='unique_order_per_akathist'
            )
        ]

# =========================================================
# КАНОНЫ
# =========================================================

class Canon(models.Model):
    title = models.CharField(
        max_length=255,
        verbose_name='Название',
    )

    slug = models.SlugField(
        unique=True,
        verbose_name='URL-идентификатор',
    )

    description = models.TextField(
        blank=True,
        verbose_name='Описание',
    )

    tone = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='Глас',
    )

    is_visible = models.BooleanField(
        default=True,
        verbose_name='Отображать',
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = 'Канон'
        verbose_name_plural = 'Каноны'


class CanonSection(models.Model):
    TYPE_IRMOS = 'irmos'
    TYPE_REFRAIN = 'refrain'
    TYPE_TROPARION = 'troparion'
    TYPE_THEOTOKION = 'theotokion'
    TYPE_GLORY = 'glory'
    TYPE_NOW = 'now'
    TYPE_SEDALEN = 'sedalen'
    TYPE_KONTAKION = 'kontakion'
    TYPE_IKOS = 'ikos'
    TYPE_SVETILEN = 'svetilen'
    TYPE_PRAYER = 'prayer'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (
            TYPE_IRMOS,
            'Ирмос',
        ),
        (
            TYPE_REFRAIN,
            'Припев',
        ),
        (
            TYPE_TROPARION,
            'Тропарь',
        ),
        (
            TYPE_THEOTOKION,
            'Богородичен',
        ),
        (
            TYPE_GLORY,
            'Слава',
        ),
        (
            TYPE_NOW,
            'И ныне',
        ),
        (
            TYPE_SEDALEN,
            'Седален',
        ),
        (
            TYPE_KONTAKION,
            'Кондак',
        ),
        (
            TYPE_IKOS,
            'Икос',
        ),
        (
            TYPE_SVETILEN,
            'Светилен',
        ),
        (
            TYPE_PRAYER,
            'Молитва',
        ),
        (
            TYPE_OTHER,
            'Прочее',
        ),
    ]

    canon = models.ForeignKey(
        Canon,
        on_delete=models.CASCADE,
        related_name='sections',
        verbose_name='Канон',
    )

    section_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_OTHER,
        verbose_name='Тип элемента',
    )

    variant = models.PositiveSmallIntegerField(
        default=1,
        verbose_name='Вариант',
    )

    ode_number = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name='Номер песни',
    )

    heading = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Заголовок / метка',
    )

    text = models.ForeignKey(
        Text,
        on_delete=models.PROTECT,
        related_name='canon_sections',
        verbose_name='Текст',
    )

    order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок',
    )

    def __str__(self):
        ode = (
            f'Песнь {self.ode_number}: '
            if self.ode_number
            else ''
        )

        return (
            f'{self.canon}: '
            f'{ode}'
            f'{self.get_section_type_display()}'
        )

    class Meta:
        ordering = [
            'variant',
            'order',
        ]

        verbose_name = 'Элемент канона'
        verbose_name_plural = 'Элементы канона'

        constraints = [
            models.UniqueConstraint(
                fields=[
                    'canon',
                    'variant',
                    'order',
                ],
                name='unique_order_per_canon_variant',
            ),
        ]


# =========================================================
# ПСАЛТИРЬ
# =========================================================

class Psalter(models.Model):
    name = models.CharField(max_length=255, verbose_name='Название')
    slug = models.SlugField(unique=True, verbose_name='Url-индетификатор')

    description = models.TextField(blank=True, verbose_name='Описание')
    is_visible = models.BooleanField(default=True, verbose_name='Отображать')

    prayers_before = models.TextField(
        blank=True,
        verbose_name='Молитвы перед чтением Псалтири'
    )
    prayers_after = models.TextField(
        blank=True,
        verbose_name='Молитвы после чтения Псалтири'
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Псалтирь'
        verbose_name_plural = 'Псалтири'

class Kathisma(models.Model):
    psalter = models.ForeignKey(Psalter, on_delete=models.CASCADE, related_name='kathismas',verbose_name='Псалтирь')
    number = models.PositiveIntegerField(verbose_name='Номер кафизмы')
    title = models.CharField(max_length=255, blank=True,verbose_name='Название')
    prayers_after = models.TextField(
        blank=True,
        verbose_name='Молитвы после кафизмы'
    )

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


# =========================================================
# ЦИТАТА ДНЯ
# =========================================================

class DailyQuote(models.Model):
    text = models.TextField(
        verbose_name='Текст цитаты',
    )

    source = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Источник / автор',
    )

    reference = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Ссылка на источник',
    )

    quote_date = models.DateField(
        null=True,
        blank=True,
        unique=True,
        verbose_name='Дата показа',
        help_text=(
            'Если дата не указана, цитата участвует '
            'в ежедневной автоматической ротации.'
        ),
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна',
    )

    order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок',
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Создано',
    )

    def __str__(self):
        if self.reference:
            return f'{self.reference}: {self.text[:60]}'

        return self.text[:60]

    class Meta:
        ordering = [
            'quote_date',
            'order',
            'id',
        ]

        verbose_name = 'Цитата дня'
        verbose_name_plural = 'Цитаты дня'


# =========================================================
# СОХРАНЁННЫЕ ФРАГМЕНТЫ И ЦЕЛЫЕ ТЕКСТЫ
# =========================================================

class SavedItem(models.Model):
    SAVE_TYPE_CHOICES = [
        ('word', 'Слово'),
        ('sentence', 'Предложение'),
        ('paragraph', 'Абзац'),
        ('fragment', 'Фрагмент'),
        ('verse', 'Стих'),
        ('section', 'Раздел'),
        ('prayer', 'Молитва'),
        ('psalm', 'Псалом'),
        ('kathisma', 'Кафизма'),
        ('chapter', 'Глава'),
        ('akathist', 'Акафист'),
        ('canon', 'Канон'),
        ('text', 'Текст'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saved_items',
        verbose_name='Пользователь',
    )

    save_type = models.CharField(
        max_length=30,
        choices=SAVE_TYPE_CHOICES,
        verbose_name='Тип сохранения',
    )

    source_type = models.CharField(
        max_length=50,
        verbose_name='Тип источника',
    )

    source_id = models.PositiveIntegerField(
        verbose_name='ID источника',
    )

    anchor_type = models.CharField(
        max_length=50,
        verbose_name='Тип элемента',
    )

    anchor_id = models.PositiveIntegerField(
        verbose_name='ID элемента',
    )

    source_title = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Название источника',
    )

    item_title = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Название элемента',
    )

    text = models.TextField(
        blank=True,
        verbose_name='Сохранённый текст',
    )

    start_offset = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Начало выделения',
    )

    end_offset = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Конец выделения',
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Дополнительные данные',
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Сохранено',
    )

    def __str__(self):
        title = (
            self.item_title
            or self.source_title
            or self.text[:50]
            or self.get_save_type_display()
        )

        return (
            f'{self.get_save_type_display()}: '
            f'{title}'
        )

    class Meta:
        ordering = [
            '-created_at',
        ]

        verbose_name = 'Сохранённый элемент'
        verbose_name_plural = 'Сохранённые элементы'

class ReadingProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reading_progress',verbose_name='Пользователь')
    source_type = models.CharField(max_length=50, verbose_name='Тип источника')
    source_id = models.PositiveIntegerField(verbose_name='ID источника')
    anchor_type = models.CharField(max_length=50,blank=True,verbose_name='Тип позиции')
    anchor_id = models.PositiveIntegerField(null=True,blank=True,verbose_name='ID позиции')
    offset = models.PositiveIntegerField(default=0, verbose_name='Смещение внутри єлемента')
    updated_at = models.DateTimeField(auto_now=True,verbose_name='Обновлено')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user','source_type','source_id',], name='unique_reading_progress_per_source',)]

        def __str__(self):
            return (f'{self.user} -' f'{self.source_type}:{self.source_id}')

# =========================================================
# БИБЛИЯ
# =========================================================

class BibleTranslation(models.Model):
    code = models.SlugField(
        unique=True,
        verbose_name='Код перевода',
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название',
    )
    language = models.CharField(
        max_length=10,
        default='ru',
        verbose_name='Язык',
    )
    source_url = models.URLField(
        blank=True,
        verbose_name='Источник',
    )
    source_revision = models.CharField(
        max_length=64,
        blank=True,
        verbose_name='Ревизия источника',
    )
    license_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Лицензия',
    )
    is_visible = models.BooleanField(
        default=True,
        verbose_name='Отображать',
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Перевод Библии'
        verbose_name_plural = 'Переводы Библии'


class BibleBook(models.Model):
    TESTAMENT_OLD = 'old'
    TESTAMENT_NEW = 'new'

    TESTAMENT_CHOICES = [
        (TESTAMENT_OLD, 'Ветхий Завет'),
        (TESTAMENT_NEW, 'Новый Завет'),
    ]

    SECTION_OLD = 'old'
    SECTION_GOSPELS = 'gospels'
    SECTION_ACTS = 'acts'
    SECTION_EPISTLES = 'epistles'
    SECTION_REVELATION = 'revelation'

    SECTION_CHOICES = [
        (SECTION_OLD, 'Ветхий Завет'),
        (SECTION_GOSPELS, 'Евангелия'),
        (SECTION_ACTS, 'Деяния'),
        (SECTION_EPISTLES, 'Послания'),
        (SECTION_REVELATION, 'Апокалипсис'),
    ]

    translation = models.ForeignKey(
        BibleTranslation,
        on_delete=models.CASCADE,
        related_name='books',
        verbose_name='Перевод',
    )
    testament = models.CharField(
        max_length=10,
        choices=TESTAMENT_CHOICES,
        verbose_name='Завет',
    )
    section = models.CharField(
        max_length=20,
        choices=SECTION_CHOICES,
        verbose_name='Раздел',
    )
    code = models.CharField(
        max_length=8,
        verbose_name='USFM-код',
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Полное название',
    )
    short_name = models.CharField(
        max_length=100,
        verbose_name='Краткое название',
    )
    slug = models.SlugField(
        max_length=100,
        verbose_name='URL-идентификатор',
    )
    canonical_order = models.PositiveSmallIntegerField(
        verbose_name='Канонический порядок',
    )
    is_appendix = models.BooleanField(
        default=False,
        verbose_name='Отдельная дополнительная единица источника',
        help_text=(
            'Используется для машинной структуры источника, '
            'например для отдельно вынесенной Молитвы Манассии.'
        ),
    )

    def __str__(self):
        return self.short_name or self.name

    class Meta:
        ordering = ['canonical_order']
        verbose_name = 'Книга Библии'
        verbose_name_plural = 'Книги Библии'
        constraints = [
            models.UniqueConstraint(
                fields=['translation', 'code'],
                name='unique_bible_book_code_per_translation',
            ),
            models.UniqueConstraint(
                fields=['translation', 'slug'],
                name='unique_bible_book_slug_per_translation',
            ),
            models.UniqueConstraint(
                fields=['translation', 'canonical_order'],
                name='unique_bible_book_order_per_translation',
            ),
        ]


class BibleChapter(models.Model):
    book = models.ForeignKey(
        BibleBook,
        on_delete=models.CASCADE,
        related_name='chapters',
        verbose_name='Книга',
    )
    number = models.PositiveSmallIntegerField(
        verbose_name='Номер главы',
    )

    def __str__(self):
        return f'{self.book.short_name}, глава {self.number}'

    class Meta:
        ordering = ['number']
        verbose_name = 'Глава Библии'
        verbose_name_plural = 'Главы Библии'
        constraints = [
            models.UniqueConstraint(
                fields=['book', 'number'],
                name='unique_bible_chapter_per_book',
            ),
        ]


class BibleVerse(models.Model):
    chapter = models.ForeignKey(
        BibleChapter,
        on_delete=models.CASCADE,
        related_name='verses',
        verbose_name='Глава',
    )
    number = models.PositiveSmallIntegerField(
        verbose_name='Номер стиха',
    )
    text = models.TextField(
        verbose_name='Текст',
    )

    def __str__(self):
        return (
            f'{self.chapter.book.short_name} '
            f'{self.chapter.number}:{self.number}'
        )

    class Meta:
        ordering = ['number']
        verbose_name = 'Стих Библии'
        verbose_name_plural = 'Стихи Библии'
        constraints = [
            models.UniqueConstraint(
                fields=['chapter', 'number'],
                name='unique_bible_verse_per_chapter',
            ),
        ]

