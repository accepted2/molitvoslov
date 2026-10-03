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
    Akathist,
    AkathistSection,
    Canon,
    CanonSection,
    DailyQuote,
    SavedItem,
    MemorialBook,
    MemorialPhoto,
    PersonalPrayerBook,
    PersonalPrayer,
    PersonalPrayerBookItem,
    PersonalPrayerPhoto,
    BibleTranslation,
)
from django.utils.html import format_html
from .calendar_models import CalendarDay, CalendarFeast, CalendarFastType, CalendarReading


class CategoryTextInline(admin.TabularInline):
    """Inline для добавления категорий с порядком прямо в тексте"""

    model = CategoryText
    extra = 1
    autocomplete_fields = ["category"]
    fields = ["category", "order"]
    ordering = ["order"]

    verbose_name = "Категория"
    verbose_name_plural = "Категории (с порядком)"


class CategoryPrayerInline(admin.TabularInline):
    """Молитвы внутри выбранной категории."""

    model = CategoryText
    fk_name = "category"
    extra = 1
    autocomplete_fields = ["text"]
    fields = ["text", "order"]
    ordering = ["order"]

    verbose_name = "Молитва"
    verbose_name_plural = "Молитвы в категории"


class CollectionItemInline(admin.TabularInline):
    """Inline для добавления текста в сборник прямо из админки"""

    model = CollectionItem
    extra = 1
    autocomplete_fields = ["collection"]
    fields = ["collection", "order"]
    ordering = ["order"]

    verbose_name = "Сборник"
    verbose_name_plural = "Сборники (с порядком)"


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "slug",
        "parent",
        "order",
        "icon",
    ]

    search_fields = [
        "name",
    ]

    prepopulated_fields = {"slug": ("name",)}

    list_filter = [
        "parent",
    ]

    ordering = [
        "order",
    ]

    inlines = [CategoryPrayerInline]


@admin.register(Text)
class TextAdmin(admin.ModelAdmin):
    list_display = [
        "title_or_description",
        "categories_list",
        "content_preview",
        "language",
        "is_visible",
        "slug",
    ]

    list_display_links = [
        "title_or_description",
    ]

    search_fields = [
        "title",
        "description",
        "content",
        "traditional_content",
        "translation",
        "slug",
    ]

    list_filter = [
        "language",
        "is_visible",
    ]

    list_editable = [
        "is_visible",
    ]

    save_on_top = True

    inlines = [
        CategoryTextInline,
        CollectionItemInline,
    ]

    prepopulated_fields = {
        "slug": (
            "title",
            "description",
        )
    }

    fieldsets = (
        (
            "📖 Молитва",
            {
                "fields": (
                    "title",
                    "description",
                    "description_position",
                    "content",
                    "traditional_content",
                    "translation",
                    "slug",
                ),
                "classes": (
                    "wide",
                    "extrapretty",
                ),
                "description": "Заголовок и описание не обязательны. "
                "Slug сгенерируется автоматически.",
            },
        ),
        (
            "🌍 Язык и видимость",
            {
                "fields": (
                    "language",
                    "is_visible",
                ),
                "classes": ("wide",),
            },
        ),
    )

    def title_or_description(self, obj):
        if obj.title:
            return obj.title[:60] + "…" if len(obj.title) > 60 else obj.title

        if obj.description:
            return obj.description[:60] + "…" if len(obj.description) > 60 else obj.description

        return obj.content[:40] + "…"

    title_or_description.short_description = "Заголовок / Описание"

    def categories_list(self, obj):
        return ", ".join(cat.name for cat in obj.categories.all())

    categories_list.short_description = "Категории"

    def content_preview(self, obj):
        if len(obj.content) > 50:
            return obj.content[:50] + "…"

        return obj.content

    content_preview.short_description = "Содержание"


@admin.register(CategoryText)
class CategoryTextAdmin(admin.ModelAdmin):
    list_display = [
        "category",
        "text",
        "order",
    ]

    list_filter = [
        "category",
    ]

    autocomplete_fields = [
        "category",
        "text",
    ]

    ordering = [
        "category",
        "order",
    ]


@admin.register(UserCollection)
class UserCollectionAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "name",
        "is_default",
        "created_at",
    ]

    list_filter = [
        "user",
        "is_default",
    ]

    search_fields = [
        "name",
        "user__username",
    ]

    readonly_fields = [
        "created_at",
    ]


@admin.register(CollectionItem)
class CollectionItemAdmin(admin.ModelAdmin):
    list_display = [
        "collection",
        "text",
        "order",
        "added_at",
    ]

    list_filter = [
        "collection",
    ]

    autocomplete_fields = [
        "collection",
        "text",
    ]

    ordering = [
        "collection",
        "order",
    ]


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "text",
        "collection",
        "position",
        "created_at",
    ]

    list_filter = [
        "user",
    ]

    autocomplete_fields = [
        "user",
        "text",
        "collection",
    ]

    readonly_fields = [
        "created_at",
    ]


# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================


class PrayerRuleItemsInline(admin.TabularInline):
    model = PrayerRuleItem
    extra = 0

    autocomplete_fields = [
        "text",
    ]

    fields = [
        "order",
        "item_type",
        "text",
        "title",
        "content",
        "note",
    ]

    ordering = [
        "order",
    ]

    verbose_name = "Элемент правила"
    verbose_name_plural = "Элементы правила"


class PrayerRuleFootnoteInline(admin.TabularInline):
    model = PrayerRuleFootnote
    extra = 0

    fields = [
        "number",
        "content",
    ]

    ordering = [
        "number",
    ]

    verbose_name = "Сноска"
    verbose_name_plural = "Сноски"


@admin.register(PrayerRule)
class PrayerRuleAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "slug",
        "is_visible",
    ]

    search_fields = [
        "name",
        "description",
    ]

    list_filter = [
        "is_visible",
    ]

    prepopulated_fields = {"slug": ("name",)}

    inlines = [
        PrayerRuleItemsInline,
        PrayerRuleFootnoteInline,
    ]


@admin.register(PrayerRuleItem)
class PrayerRuleItemAdmin(admin.ModelAdmin):
    list_display = [
        "rule",
        "order",
        "item_type",
        "text",
        "title",
        "content_preview",
        "note",
    ]

    list_filter = [
        "rule",
        "item_type",
    ]

    search_fields = [
        "rule__name",
        "text__title",
        "text__description",
        "text__content",
        "title",
        "content",
        "note",
    ]

    autocomplete_fields = [
        "rule",
        "text",
    ]

    ordering = [
        "rule",
        "order",
    ]

    def content_preview(self, obj):
        if not obj.content:
            return ""

        if len(obj.content) > 50:
            return obj.content[:50] + "…"

        return obj.content

    content_preview.short_description = "Содержимое"


@admin.register(PrayerRuleFootnote)
class PrayerRuleFootnoteAdmin(admin.ModelAdmin):
    list_display = [
        "rule",
        "number",
        "content_preview",
    ]

    list_filter = [
        "rule",
    ]

    search_fields = [
        "rule__name",
        "content",
    ]

    autocomplete_fields = [
        "rule",
    ]

    ordering = [
        "rule",
        "number",
    ]

    def content_preview(self, obj):
        if len(obj.content) > 80:
            return obj.content[:80] + "…"

        return obj.content

    content_preview.short_description = "Текст сноски"


@admin.register(Psalter)
class PslaterAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_visible"]
    search_fields = [
        "name",
        "description",
    ]
    list_filter = ["is_visible"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Kathisma)
class KathismaAdmin(admin.ModelAdmin):
    list_display = [
        "number",
        "psalter",
        "title",
    ]
    list_filter = ["psalter"]
    search_fields = ["title"]
    ordering = [
        "psalter",
        "number",
    ]
    autocomplete_fields = ["psalter"]


class PsalmVerseInline(admin.TabularInline):
    model = PsalmVerse
    extra = 0
    fields = [
        "number",
        "church_slavonic",
        "church_slavonic_traditional",
        "russian",
    ]
    ordering = ["number"]


@admin.register(Psalm)
class PsalmAdmin(admin.ModelAdmin):
    list_display = [
        "number",
        "kathisma",
        "title_church_slavonic",
        "title_church_slavonic_traditional",
        "title_russian",
    ]
    list_filter = [
        "kathisma",
    ]
    search_fields = [
        "number",
        "title_church_slavonic",
        "title_church_slavonic_traditional",
        "title_russian",
        "description",
        "verses__church_slavonic",
        "verses__russian",
    ]
    ordering = ["number"]
    autocomplete_fields = [
        "kathisma",
    ]
    inlines = [PsalmVerseInline]


@admin.register(PsalmVerse)
class PsalmVerseAdmin(admin.ModelAdmin):
    list_display = [
        "psalm",
        "number",
        "church_slavonic_preview",
        "traditional_preview",
        "russian_preview",
    ]

    list_filter = [
        "psalm__kathisma",
    ]

    search_fields = [
        "church_slavonic",
        "church_slavonic_traditional",
        "russian",
    ]

    ordering = [
        "psalm__number",
        "number",
    ]

    autocomplete_fields = [
        "psalm",
    ]

    @admin.display(description="Церковнославянский")
    def church_slavonic_preview(self, obj):
        if len(obj.church_slavonic) > 80:
            return obj.church_slavonic[:80] + "..."

        return obj.church_slavonic

    @admin.display(description="ЦС традиционный")
    def traditional_preview(self, obj):
        value = obj.church_slavonic_traditional or ""
        if len(value) > 80:
            return value[:80] + "..."

        return value

    @admin.display(description="Русский")
    def russian_preview(self, obj):
        if len(obj.russian) > 80:
            return obj.russian[:80] + "..."

        return obj.russian


@admin.register(KathismaGlory)
class KathismaGloryAdmin(admin.ModelAdmin):
    list_display = [
        "kathisma",
        "number",
        "after_psalm",
        "after_verse",
    ]

    list_filter = [
        "kathisma",
    ]

    ordering = [
        "kathisma__number",
        "number",
    ]

    autocomplete_fields = [
        "kathisma",
        "after_psalm",
        "after_verse",
    ]


# =========================================================
# АКАФИСТЫ
# =========================================================


class AkathistSectionInline(admin.TabularInline):
    model = AkathistSection
    extra = 0

    autocomplete_fields = [
        "text",
    ]

    fields = [
        "order",
        "section_type",
        "number",
        "text",
        "note",
    ]

    ordering = [
        "order",
    ]

    verbose_name = "Раздел акафиста"
    verbose_name_plural = "Разделы акафиста"


@admin.register(Akathist)
class AkathistAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "slug",
        "is_visible",
    ]

    search_fields = [
        "title",
        "description",
    ]

    list_filter = [
        "is_visible",
    ]

    prepopulated_fields = {"slug": ("title",)}

    inlines = [
        AkathistSectionInline,
    ]


@admin.register(AkathistSection)
class AkathistSectionAdmin(admin.ModelAdmin):
    list_display = [
        "akathist",
        "order",
        "section_type",
        "number",
        "text",
        "note",
    ]

    list_filter = [
        "akathist",
        "section_type",
    ]

    search_fields = [
        "akathist__title",
        "text__title",
        "text__description",
        "text__content",
        "text__translation",
        "note",
    ]

    autocomplete_fields = [
        "akathist",
        "text",
    ]

    ordering = [
        "akathist",
        "order",
    ]


# =========================================================
# КАНОНЫ
# =========================================================


class CanonSectionInline(admin.TabularInline):
    model = CanonSection
    extra = 0

    autocomplete_fields = [
        "text",
    ]

    fields = [
        "order",
        "variant",
        "ode_number",
        "section_type",
        "heading",
        "text",
    ]

    ordering = [
        "order",
    ]

    verbose_name = "Элемент канона"
    verbose_name_plural = "Элементы канона"


@admin.register(Canon)
class CanonAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "slug",
        "tone",
        "is_visible",
    ]

    search_fields = [
        "title",
        "description",
        "slug",
    ]

    list_filter = [
        "is_visible",
        "tone",
    ]

    prepopulated_fields = {"slug": ("title",)}

    inlines = [
        CanonSectionInline,
    ]


@admin.register(CanonSection)
class CanonSectionAdmin(admin.ModelAdmin):
    list_display = [
        "canon",
        "variant",
        "order",
        "ode_number",
        "section_type",
        "heading",
        "text",
    ]

    list_filter = [
        "canon",
        "variant",
        "ode_number",
        "section_type",
    ]

    search_fields = [
        "canon__title",
        "heading",
        "text__title",
        "text__content",
        "text__translation",
    ]

    autocomplete_fields = [
        "canon",
        "text",
    ]

    ordering = [
        "canon",
        "order",
    ]


# =========================================================
# ЦИТАТЫ ДНЯ
# =========================================================


@admin.register(DailyQuote)
class DailyQuoteAdmin(admin.ModelAdmin):
    list_display = [
        "reference",
        "text_preview",
        "quote_date",
        "is_active",
        "order",
    ]

    list_filter = [
        "is_active",
        "quote_date",
    ]

    search_fields = [
        "text",
        "source",
        "reference",
    ]

    list_editable = [
        "is_active",
        "order",
    ]

    ordering = [
        "quote_date",
        "order",
        "id",
    ]

    @admin.display(
        description="Цитата",
    )
    def text_preview(self, obj):
        if len(obj.text) > 90:
            return obj.text[:90] + "…"

        return obj.text


@admin.register(SavedItem)
class SavedItemAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "save_type",
        "source_title",
        "item_title",
        "text_preview",
        "created_at",
    ]

    list_filter = [
        "save_type",
        "source_type",
        "anchor_type",
    ]

    search_fields = [
        "source_title",
        "item_title",
        "text",
        "user__username",
    ]

    readonly_fields = [
        "created_at",
    ]

    ordering = [
        "-created_at",
    ]

    @admin.display(
        description="Текст",
    )
    def text_preview(self, obj):
        if not obj.text:
            return ""

        if len(obj.text) > 80:
            return obj.text[:80] + "…"

        return obj.text


# =========================================================
# ПОМЯННИК
# =========================================================


class MemorialPhotoInline(admin.TabularInline):
    model = MemorialPhoto
    extra = 0
    fields = [
        "sync_id",
        "original_name",
        "content_type",
        "order",
        "created_at",
        "updated_at",
        "deleted_at",
    ]
    readonly_fields = [
        "sync_id",
        "created_at",
        "updated_at",
    ]
    ordering = [
        "order",
        "created_at",
    ]


@admin.register(MemorialBook)
class MemorialBookAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "user",
        "health_count",
        "repose_count",
        "updated_at",
        "deleted_at",
    ]

    list_filter = [
        "deleted_at",
        "updated_at",
    ]

    search_fields = [
        "title",
        "user__username",
        "user__email",
    ]

    readonly_fields = [
        "sync_id",
        "created_at",
        "updated_at",
    ]

    ordering = [
        "-updated_at",
    ]

    inlines = [
        MemorialPhotoInline,
    ]

    @admin.display(
        description="О здравии",
    )
    def health_count(self, obj):
        return len(obj.health_names or [])

    @admin.display(
        description="Об упокоении",
    )
    def repose_count(self, obj):
        return len(obj.repose_names or [])


@admin.register(MemorialPhoto)
class MemorialPhotoAdmin(admin.ModelAdmin):
    list_display = [
        "book",
        "original_name",
        "content_type",
        "order",
        "created_at",
        "deleted_at",
    ]

    list_filter = [
        "content_type",
        "deleted_at",
    ]

    search_fields = [
        "book__title",
        "book__user__username",
        "original_name",
        "storage_path",
    ]

    readonly_fields = [
        "sync_id",
        "storage_path",
        "created_at",
        "updated_at",
    ]

    ordering = [
        "book",
        "order",
        "created_at",
    ]


# =========================================================
# ЛИЧНЫЙ МОЛИТВОСЛОВ
# =========================================================


@admin.register(PersonalPrayerBook)
class PersonalPrayerBookAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "updated_at", "deleted_at"]
    search_fields = ["title", "description", "user__username", "user__email"]
    list_filter = ["deleted_at", "updated_at"]
    readonly_fields = ["sync_id", "created_at", "updated_at"]


@admin.register(PersonalPrayer)
class PersonalPrayerAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "origin_type", "updated_at", "deleted_at"]
    search_fields = ["title", "text", "user__username", "user__email"]
    list_filter = ["origin_type", "deleted_at"]
    readonly_fields = ["sync_id", "created_at", "updated_at"]


@admin.register(PersonalPrayerBookItem)
class PersonalPrayerBookItemAdmin(admin.ModelAdmin):
    list_display = ["book", "prayer", "order", "deleted_at"]
    search_fields = ["book__title", "prayer__title"]
    list_filter = ["deleted_at"]
    readonly_fields = ["sync_id", "created_at", "updated_at"]


@admin.register(PersonalPrayerPhoto)
class PersonalPrayerPhotoAdmin(admin.ModelAdmin):
    list_display = ["prayer", "original_name", "content_type", "order", "deleted_at"]
    search_fields = ["prayer__title", "original_name", "storage_path"]
    list_filter = ["content_type", "deleted_at"]
    readonly_fields = ["sync_id", "storage_path", "created_at", "updated_at"]


# =========================================================
# ЦЕРКОВНЫЙ КАЛЕНДАРЬ
# =========================================================


@admin.register(CalendarFeast)
class CalendarFeastAdmin(admin.ModelAdmin):
    list_display = [
        "source_id",
        "title_preview",
        "title_uk_preview",
        "celebration_dates",
        "celebration_type",
        "celebration_rank",
        "has_icon",
    ]

    list_filter = [
        "celebration_type",
        "celebration_rank",
        "date_type",
    ]

    search_fields = [
        "title",
        "short_title",
        "title_uk",
        "short_title_uk",
        "source_id",
    ]

    ordering = [
        "title",
        "source_id",
    ]

    readonly_fields = [
        "gregorian_dates_display",
        "icon_preview",
        "all_dates",
        "updated_at",
    ]

    fieldsets = [
        (
            "Основное",
            {
                "fields": [
                    "source_id",
                    "date_type",
                    "celebration_type",
                    "celebration_rank",
                ]
            },
        ),
        (
            "Название — русский",
            {
                "fields": [
                    "title",
                    "short_title",
                ]
            },
        ),
        (
            "Название — украинский",
            {
                "fields": [
                    "title_uk",
                    "short_title_uk",
                ]
            },
        ),
        (
            "Дата",
            {
                "fields": [
                    "gregorian_dates_display",
                    "julian_month",
                    "julian_day",
                    "easter_offset",
                ]
            },
        ),
        (
            "Служебные данные дат",
            {
                "classes": ["collapse"],
                "fields": [
                    "all_dates",
                ],
            },
        ),
        (
            "Икона",
            {
                "fields": [
                    "icon_url",
                    "icon_preview",
                ]
            },
        ),
        (
            "Тропарь — русский",
            {
                "classes": ["collapse"],
                "fields": [
                    "troparion_title",
                    "troparion_content",
                    "troparion_echo",
                ],
            },
        ),
        (
            "Тропарь — украинский",
            {
                "classes": ["collapse"],
                "fields": [
                    "troparion_title_uk",
                    "troparion_content_uk",
                ],
            },
        ),
        (
            "Кондак — русский",
            {
                "classes": ["collapse"],
                "fields": [
                    "kontakion_title",
                    "kontakion_content",
                    "kontakion_echo",
                ],
            },
        ),
        (
            "Кондак — украинский",
            {
                "classes": ["collapse"],
                "fields": [
                    "kontakion_title_uk",
                    "kontakion_content_uk",
                ],
            },
        ),
        (
            "Житие — русский",
            {
                "classes": ["collapse"],
                "fields": [
                    "life_title",
                    "life_content",
                    "description",
                ],
            },
        ),
        (
            "Житие — украинский",
            {
                "classes": ["collapse"],
                "fields": [
                    "life_title_uk",
                    "life_content_uk",
                    "description_uk",
                ],
            },
        ),
        (
            "Служебное",
            {
                "fields": [
                    "updated_at",
                ]
            },
        ),
    ]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .prefetch_related(
                "calendar_days",
                "main_days",
            )
        )

    @admin.display(description="Название RU")
    def title_preview(self, obj):
        value = obj.short_title or obj.title or ""

        if len(value) > 70:
            return value[:70] + "…"

        return value

    @admin.display(description="Название UK")
    def title_uk_preview(self, obj):
        value = obj.short_title_uk or obj.title_uk or ""

        if len(value) > 70:
            return value[:70] + "…"

        return value or "—"

    @admin.display(boolean=True, description="Икона")
    def has_icon(self, obj):
        return bool(obj.icon_url)

    @admin.display(description="Предпросмотр иконы")
    def icon_preview(self, obj):
        if not obj.icon_url:
            return "Икона не указана"

        return format_html(
            '<div style="margin-bottom:8px;">'
            '<img src="{}" '
            'style="max-width:220px; max-height:260px; '
            'object-fit:contain; border-radius:8px;" />'
            "</div>"
            '<a href="{}" target="_blank">{}</a>',
            obj.icon_url,
            obj.icon_url,
            obj.icon_url,
        )

    @admin.display(description="Дата по новому стилю")
    def gregorian_dates_display(self, obj):
        dates = set(
            obj.calendar_days.values_list(
                "date_gregorian",
                flat=True,
            )
        )

        dates.update(
            obj.main_days.values_list(
                "date_gregorian",
                flat=True,
            )
        )

        if not dates:
            return "Пока не привязано к дням календаря"

        dates = sorted(dates)

        return ", ".join(date.strftime("%d.%m.%Y") for date in dates)

    @admin.display(description="Дата празднования")
    def celebration_dates(self, obj):
        dates = set()

        # Обычная привязка через список памятей дня
        for day in obj.calendar_days.all():
            dates.add(
                (
                    day.date_gregorian.month,
                    day.date_gregorian.day,
                )
            )

        # Если святой/праздник указан как главный праздник дня
        for day in obj.main_days.all():
            dates.add(
                (
                    day.date_gregorian.month,
                    day.date_gregorian.day,
                )
            )

        if not dates:
            return "—"

        dates = sorted(dates)

        return ", ".join(f"{day:02d}.{month:02d}" for month, day in dates)


@admin.register(CalendarFastType)
class CalendarFastTypeAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "type_title",
        "name_uk",
        "type_title_uk",
        "code",
        "is_active",
        "order",
    ]

    list_editable = [
        "is_active",
        "order",
    ]

    search_fields = [
        "code",
        "name",
        "type_title",
        "name_uk",
        "type_title_uk",
    ]

    ordering = [
        "order",
        "name",
        "type_title",
        "code",
    ]

    readonly_fields = [
        "sync_uid",
    ]

    fieldsets = [
        (
            "Основное",
            {
                "fields": [
                    "code",
                    "is_active",
                    "order",
                ]
            },
        ),
        (
            "Русский",
            {
                "fields": [
                    "type_title",
                    "name",
                    "description",
                ]
            },
        ),
        (
            "Украинский",
            {
                "fields": [
                    "type_title_uk",
                    "name_uk",
                    "description_uk",
                ]
            },
        ),
        (
            "Служебное",
            {
                "classes": ["collapse"],
                "fields": [
                    "sync_uid",
                ],
            },
        ),
    ]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)

        # Если изменили сам пост — обновляем все дни,
        # к которым он уже привязан.
        obj.calendar_days.update(
            fast_type_code=obj.code,
            fast_type_title=obj.type_title,
            fast_name=obj.name,
            fast_description=obj.description,
            fast_type_title_uk=obj.type_title_uk,
            fast_name_uk=obj.name_uk,
            fast_description_uk=obj.description_uk,
        )


class CalendarReadingInline(admin.TabularInline):
    model = CalendarReading
    extra = 1
    fields = [
        "kind",
        "label",
        "title",
        "order",
    ]
    ordering = [
        "order",
        "id",
    ]
    verbose_name = "Чтение"
    verbose_name_plural = (
        "Чтения — добавляйте каждое Евангелие/Апостол отдельной строкой. "
        "Ссылка одна для RU и UK."
    )


@admin.register(CalendarDay)
class CalendarDayAdmin(admin.ModelAdmin):
    list_display = [
        "date_gregorian",
        "main_feast",
        "imported_languages",
        "has_fast_ru",
        "has_fast_uk",
        "has_gospel",
        "has_apostolic",
    ]

    list_filter = [
        "fast_type_code",
        "date_gregorian",
    ]

    search_fields = [
        "main_feast__title",
        "main_feast__short_title",
        "main_feast__title_uk",
        "main_feast__short_title_uk",
        "fast_name",
        "fast_name_uk",
        "gospel_title",
        "apostolic_title",
        "readings__title",
        "readings__label",
    ]

    date_hierarchy = "date_gregorian"

    ordering = [
        "-date_gregorian",
    ]

    autocomplete_fields = [
        "main_feast",
        "fast_type",
    ]

    filter_horizontal = [
        "feasts",
    ]

    inlines = [
        CalendarReadingInline,
    ]

    readonly_fields = [
        "imported_languages",
        "source_payload",
        "updated_at",
    ]

    fieldsets = [
        (
            "Дата и память дня",
            {
                "fields": [
                    "date_gregorian",
                    "julian_month",
                    "julian_day",
                    "main_feast",
                    "feasts",
                    "imported_languages",
                ]
            },
        ),
        (
            "Пост",
            {
                "fields": [
                    "fast_type",
                ]
            },
        ),
        (
            "Описание дня — русский",
            {
                "classes": ["collapse"],
                "fields": [
                    "summary",
                    "short_summary",
                ],
            },
        ),
        (
            "Описание дня — украинский",
            {
                "classes": ["collapse"],
                "fields": [
                    "summary_uk",
                    "short_summary_uk",
                ],
            },
        ),
        (
            "Служебные данные",
            {
                "classes": ["collapse"],
                "fields": [
                    "source_payload",
                    "updated_at",
                ],
            },
        ),
    ]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("main_feast", "fast_type")
            .prefetch_related("feasts", "readings")
        )

    @admin.display(description="Языки")
    def imported_languages(self, obj):
        languages = (obj.source_payload or {}).get("imported_languages") or []

        if not languages:
            return "—"

        return ", ".join(language.upper() for language in languages)

    @admin.display(boolean=True, description="Пост RU")
    def has_fast_ru(self, obj):
        return bool(obj.fast_type_title or obj.fast_name or obj.fast_description)

    @admin.display(boolean=True, description="Пост UK")
    def has_fast_uk(self, obj):
        return bool(obj.fast_type_title_uk or obj.fast_name_uk or obj.fast_description_uk)

    @admin.display(boolean=True, description="Евангелие")
    def has_gospel(self, obj):
        return any(reading.kind == CalendarReading.KIND_GOSPEL for reading in obj.readings.all()) or bool(
            obj.gospel_title
        )

    @admin.display(boolean=True, description="Апостол")
    def has_apostolic(self, obj):
        return any(reading.kind == CalendarReading.KIND_APOSTLE for reading in obj.readings.all()) or bool(
            obj.apostolic_title
        )

    def save_model(self, request, obj, form, change):
        if obj.fast_type:
            fast = obj.fast_type

            obj.fast_type_code = fast.code

            obj.fast_type_title = fast.type_title
            obj.fast_name = fast.name
            obj.fast_description = fast.description

            obj.fast_type_title_uk = fast.type_title_uk
            obj.fast_name_uk = fast.name_uk
            obj.fast_description_uk = fast.description_uk

        super().save_model(request, obj, form, change)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)

        day = form.instance
        readings = list(day.readings.order_by("kind", "order", "id"))
        gospel = next(
            (reading for reading in readings if reading.kind == CalendarReading.KIND_GOSPEL),
            None,
        )
        apostle = next(
            (reading for reading in readings if reading.kind == CalendarReading.KIND_APOSTLE),
            None,
        )

        gospel_title = gospel.title.strip() if gospel else ""
        apostolic_title = apostle.title.strip() if apostle else ""

        # Старые поля оставляем синхронизированными для совместимости со
        # старыми сборками приложения. Ссылки на Писание одинаковы для RU/UK.
        CalendarDay.objects.filter(pk=day.pk).update(
            gospel_title=gospel_title,
            gospel_title_uk=gospel_title,
            apostolic_title=apostolic_title,
            apostolic_title_uk=apostolic_title,
        )


@admin.register(BibleTranslation)
class BibleTranslationAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "code",
        "language",
        "script_variant",
        "is_visible",
    ]
    list_filter = [
        "language",
        "script_variant",
        "is_visible",
    ]
    search_fields = [
        "name",
        "code",
        "source_url",
    ]
    list_editable = ["is_visible"]
