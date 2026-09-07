from django.contrib import admin

from .models import (
    Category,
    Text,
    CategoryText,
    UserCollection,
    CollectionItem,
    Bookmark,
    PrayerRule,
    PrayerRuleItem,
    PrayerRuleFootnote,
    Psalter,
    Kathisma,
    Psalm,
    PsalmVerse,
    KathismaGlory,
)


class CategoryTextInline(admin.TabularInline):
    """Inline для добавления категорий с порядком прямо в тексте"""

    model = CategoryText
    extra = 1
    autocomplete_fields = ['category']
    fields = ['category', 'order']
    ordering = ['order']

    verbose_name = 'Категория'
    verbose_name_plural = 'Категории (с порядком)'


class CollectionItemInline(admin.TabularInline):
    """Inline для добавления текста в сборник прямо из админки"""

    model = CollectionItem
    extra = 1
    autocomplete_fields = ['collection']
    fields = ['collection', 'order']
    ordering = ['order']

    verbose_name = 'Сборник'
    verbose_name_plural = 'Сборники (с порядком)'


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'slug',
        'parent',
        'order',
        'icon',
    ]

    search_fields = [
        'name',
    ]

    prepopulated_fields = {
        'slug': ('name',)
    }

    list_filter = [
        'parent',
    ]

    ordering = [
        'order',
    ]


@admin.register(Text)
class TextAdmin(admin.ModelAdmin):
    list_display = [
        'title_or_description',
        'categories_list',
        'content_preview',
        'language',
        'is_visible',
        'slug',
    ]

    list_display_links = [
        'title_or_description',
    ]

    search_fields = [
        'title',
        'description',
        'content',
        'translation',
        'slug',
    ]

    list_filter = [
        'language',
        'is_visible',
    ]

    list_editable = [
        'is_visible',
    ]

    save_on_top = True

    inlines = [
        CategoryTextInline,
        CollectionItemInline,
    ]

    prepopulated_fields = {
        'slug': (
            'title',
            'description',
        )
    }

    fieldsets = (
        (
            '📖 Молитва',
            {
                'fields': (
                    'title',
                    'description',
                    'description_position',
                    'content',
                    'translation',
                    'slug',
                ),
                'classes': (
                    'wide',
                    'extrapretty',
                ),
                'description':
                    'Заголовок и описание не обязательны. '
                    'Slug сгенерируется автоматически.',
            }
        ),
        (
            '🌍 Язык и видимость',
            {
                'fields': (
                    'language',
                    'is_visible',
                ),
                'classes': (
                    'wide',
                ),
            }
        ),
    )

    def title_or_description(self, obj):
        if obj.title:
            return (
                obj.title[:60] + '…'
                if len(obj.title) > 60
                else obj.title
            )

        if obj.description:
            return (
                obj.description[:60] + '…'
                if len(obj.description) > 60
                else obj.description
            )

        return obj.content[:40] + '…'

    title_or_description.short_description = (
        'Заголовок / Описание'
    )

    def categories_list(self, obj):
        return ', '.join(
            cat.name
            for cat in obj.categories.all()
        )

    categories_list.short_description = 'Категории'

    def content_preview(self, obj):
        if len(obj.content) > 50:
            return obj.content[:50] + '…'

        return obj.content

    content_preview.short_description = 'Содержание'


@admin.register(CategoryText)
class CategoryTextAdmin(admin.ModelAdmin):
    list_display = [
        'category',
        'text',
        'order',
    ]

    list_filter = [
        'category',
    ]

    autocomplete_fields = [
        'category',
        'text',
    ]

    ordering = [
        'category',
        'order',
    ]


@admin.register(UserCollection)
class UserCollectionAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'name',
        'is_default',
        'created_at',
    ]

    list_filter = [
        'user',
        'is_default',
    ]

    search_fields = [
        'name',
        'user__username',
    ]

    readonly_fields = [
        'created_at',
    ]


@admin.register(CollectionItem)
class CollectionItemAdmin(admin.ModelAdmin):
    list_display = [
        'collection',
        'text',
        'order',
        'added_at',
    ]

    list_filter = [
        'collection',
    ]

    autocomplete_fields = [
        'collection',
        'text',
    ]

    ordering = [
        'collection',
        'order',
    ]


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'text',
        'collection',
        'position',
        'created_at',
    ]

    list_filter = [
        'user',
    ]

    autocomplete_fields = [
        'user',
        'text',
        'collection',
    ]

    readonly_fields = [
        'created_at',
    ]


# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================

class PrayerRuleItemsInline(admin.TabularInline):
    model = PrayerRuleItem
    extra = 0

    autocomplete_fields = [
        'text',
    ]

    fields = [
        'order',
        'item_type',
        'text',
        'title',
        'content',
        'note',
    ]

    ordering = [
        'order',
    ]

    verbose_name = 'Элемент правила'
    verbose_name_plural = 'Элементы правила'


class PrayerRuleFootnoteInline(admin.TabularInline):
    model = PrayerRuleFootnote
    extra = 0

    fields = [
        'number',
        'content',
    ]

    ordering = [
        'number',
    ]

    verbose_name = 'Сноска'
    verbose_name_plural = 'Сноски'


@admin.register(PrayerRule)
class PrayerRuleAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'slug',
        'is_visible',
    ]

    search_fields = [
        'name',
        'description',
    ]

    list_filter = [
        'is_visible',
    ]

    prepopulated_fields = {
        'slug': ('name',)
    }

    inlines = [
        PrayerRuleItemsInline,
        PrayerRuleFootnoteInline,
    ]


@admin.register(PrayerRuleItem)
class PrayerRuleItemAdmin(admin.ModelAdmin):
    list_display = [
        'rule',
        'order',
        'item_type',
        'text',
        'title',
        'content_preview',
        'note',
    ]

    list_filter = [
        'rule',
        'item_type',
    ]

    search_fields = [
        'rule__name',
        'text__title',
        'text__description',
        'text__content',
        'title',
        'content',
        'note',
    ]

    autocomplete_fields = [
        'rule',
        'text',
    ]

    ordering = [
        'rule',
        'order',
    ]

    def content_preview(self, obj):
        if not obj.content:
            return ''

        if len(obj.content) > 50:
            return obj.content[:50] + '…'

        return obj.content

    content_preview.short_description = 'Содержимое'


@admin.register(PrayerRuleFootnote)
class PrayerRuleFootnoteAdmin(admin.ModelAdmin):
    list_display = [
        'rule',
        'number',
        'content_preview',
    ]

    list_filter = [
        'rule',
    ]

    search_fields = [
        'rule__name',
        'content',
    ]

    autocomplete_fields = [
        'rule',
    ]

    ordering = [
        'rule',
        'number',
    ]

    def content_preview(self, obj):
        if len(obj.content) > 80:
            return obj.content[:80] + '…'

        return obj.content

    content_preview.short_description = 'Текст сноски'

@admin.register(Psalter)
class PslaterAdmin(admin.ModelAdmin):
    list_display= ['name','slug','is_visible']
    search_fields = ['name','description',]
    list_filter=['is_visible']
    prepopulated_fields ={
        'slug':('name',)
    }

@admin.register(Kathisma)
class KathismaAdmin(admin.ModelAdmin):
    list_display = ['number','psalter','title',]
    list_filter = ['psalter']
    search_fields = ['title']
    ordering = [
        'psalter','number',
    ]
    autocomplete_fields = ['psalter']

class PsalmVerseInline(admin.TabularInline):
    model = PsalmVerse
    extra = 0
    fields = ['number','church_slavonic','russian']
    ordering = ['number']

@admin.register(Psalm)
class PsalmAdmin(admin.ModelAdmin):
    list_display = ['number','kathisma','title_church_slavonic','title_russian']
    list_filter = ['kathisma',]
    search_fields = ['number','title_church_slavonic','title_russian','description','verses__church_slavonic','verses__russian']
    ordering=['number']
    autocomplete_fields = ['kathisma',]
    inlines = [PsalmVerseInline]

@admin.register(PsalmVerse)
class PsalmVerseAdmin(admin.ModelAdmin):
    list_display = [
        'psalm',
        'number',
        'church_slavonic_preview',
        'russian_preview',
    ]

    list_filter = [
        'psalm__kathisma',
    ]

    search_fields = [
        'church_slavonic',
        'russian',
    ]

    ordering = [
        'psalm__number',
        'number',
    ]

    autocomplete_fields = [
        'psalm',
    ]

    @admin.display(
        description='Церковнославянский'
    )
    def church_slavonic_preview(self, obj):
        if len(obj.church_slavonic) > 80:
            return obj.church_slavonic[:80] + '...'

        return obj.church_slavonic

    @admin.display(
        description='Русский'
    )
    def russian_preview(self, obj):
        if len(obj.russian) > 80:
            return obj.russian[:80] + '...'

        return obj.russian

@admin.register(KathismaGlory)
class KathismaGloryAdmin(admin.ModelAdmin):
    list_display = [
        'kathisma',
        'number',
        'after_psalm',
        'after_verse',
    ]

    list_filter = [
        'kathisma',
    ]

    ordering = [
        'kathisma__number',
        'number',
    ]

    autocomplete_fields = [
        'kathisma',
        'after_psalm',
        'after_verse',
    ]