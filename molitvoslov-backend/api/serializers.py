from rest_framework import serializers

from .supabase_storage import StorageConfigurationError, create_signed_download_url

from .models import (
    Category,
    Text,
    CategoryText,
    PrayerRule,
    PrayerRuleItem,
    PrayerRuleFootnote,
    UserCollection,
    CollectionItem,
    Bookmark,
    Akathist,
    AkathistSection,
    Canon,
    CanonSection,
    ReadingProgress,
    DailyQuote,
    SavedItem,
    MemorialBook,
    MemorialPhoto,
    PersonalPrayerBook,
    PersonalPrayer,
    PersonalPrayerBookItem,
    PersonalPrayerPhoto,
    AkathistReadingRule,
    Psalter,
    Kathisma,
    Psalm,
    PsalmVerse,
    KathismaGlory,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "parent",
            "order",
            "icon",
        ]


class TextSerializer(serializers.ModelSerializer):
    categories = CategorySerializer(many=True, read_only=True)

    category_ids = serializers.PrimaryKeyRelatedField(
        source="categories",
        queryset=Category.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )

    class Meta:
        model = Text

        fields = [
            "id",
            "title",
            "description",
            "content",
            "translation",
            "categories",
            "description_position",
            "category_ids",
            "language",
            "slug",
        ]


class CategoryTextSerializer(serializers.ModelSerializer):
    text = TextSerializer(read_only=True)

    category = CategorySerializer(read_only=True)

    class Meta:
        model = CategoryText

        fields = [
            "id",
            "category",
            "text",
            "order",
        ]


# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================
class PrayerRuleFootnoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrayerRuleFootnote
        fields = [
            "id",
            "number",
            "content",
        ]


class PrayerRuleItemSerializer(serializers.ModelSerializer):
    text = TextSerializer(read_only=True)

    footnotes = PrayerRuleFootnoteSerializer(many=True, read_only=True)

    text_id = serializers.PrimaryKeyRelatedField(
        source="text",
        queryset=Text.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    rule_id = serializers.PrimaryKeyRelatedField(
        source="rule",
        queryset=PrayerRule.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = PrayerRuleItem

        fields = [
            "id",
            "rule_id",
            "item_type",
            "text",
            "text_id",
            "title",
            "content",
            "note",
            "footnotes",
            "order",
        ]

    def validate(self, attrs):
        item_type = attrs.get(
            "item_type", getattr(self.instance, "item_type", PrayerRuleItem.TYPE_TEXT)
        )

        text = attrs.get("text", getattr(self.instance, "text", None))

        if item_type == PrayerRuleItem.TYPE_TEXT and text is None:
            raise serializers.ValidationError(
                {"text_id": "Для элемента типа text необходимо указать текст."}
            )

        if (
            item_type
            in [
                PrayerRuleItem.TYPE_INSTRUCTION,
                PrayerRuleItem.TYPE_SECTION,
            ]
            and text is not None
        ):
            raise serializers.ValidationError(
                {"text_id": "Для инструкции или раздела Text указывать не нужно."}
            )

        return attrs


class PrayerRuleSerializer(serializers.ModelSerializer):
    items = PrayerRuleItemSerializer(many=True, read_only=True)

    footnotes = PrayerRuleFootnoteSerializer(many=True, read_only=True)

    class Meta:
        model = PrayerRule

        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_visible",
            "items",
            "footnotes",
        ]


# =========================================================
# ПСАЛТИРь
# =========================================================
class PsalmVerseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PsalmVerse
        fields = ["id", "number", "church_slavonic", "russian"]


class PsalmSerializer(serializers.ModelSerializer):
    verses = PsalmVerseSerializer(many=True, read_only=True)

    class Meta:
        model = Psalm
        fields = [
            "id",
            "number",
            "title_church_slavonic",
            "title_russian",
            "description",
            "verses",
        ]


class KathismaGlorySerializer(serializers.ModelSerializer):
    after_psalm_number = serializers.IntegerField(source="after_psalm.number", read_only=True)
    after_verse_number = serializers.IntegerField(source="after_verse.number", read_only=True)

    class Meta:
        model = KathismaGlory

        fields = [
            "id",
            "number",
            "after_psalm",
            "after_psalm_number",
            "after_verse",
            "after_verse_number",
        ]


class KathismaSerializer(serializers.ModelSerializer):
    psalms = PsalmSerializer(many=True, read_only=True)
    glories = KathismaGlorySerializer(many=True, read_only=True)

    class Meta:
        model = Kathisma
        fields = [
            "id",
            "psalter",
            "number",
            "title",
            "prayers_after",
            "prayers_after_russian",
            "psalms",
            "glories",
        ]


class KathismaSummarySerializer(serializers.ModelSerializer):
    first_psalm = serializers.SerializerMethodField()
    last_psalm = serializers.SerializerMethodField()

    class Meta:
        model = Kathisma
        fields = [
            "id",
            "number",
            "title",
            "first_psalm",
            "last_psalm",
        ]

    def get_first_psalm(self, obj):
        psalm = obj.psalms.order_by("number").first()

        if psalm:
            return psalm.number

        return None

    def get_last_psalm(self, obj):
        psalm = obj.psalms.order_by("-number").first()

        if psalm:
            return psalm.number

        return None


class PsalterSerializer(serializers.ModelSerializer):
    kathismas = KathismaSummarySerializer(many=True, read_only=True)

    class Meta:
        model = Psalter
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "prayers_before",
            "prayers_before_russian",
            "prayers_after",
            "prayers_after_russian",
            "is_visible",
            "kathismas",
        ]


# =========================================================
# АКАФИСТЫ
# =========================================================


class AkathistSectionSerializer(serializers.ModelSerializer):
    text = TextSerializer(read_only=True)

    text_id = serializers.PrimaryKeyRelatedField(
        source="text",
        queryset=Text.objects.all(),
        write_only=True,
        required=True,
    )

    class Meta:
        model = AkathistSection

        fields = [
            "id",
            "section_type",
            "number",
            "text",
            "text_id",
            "note",
            "order",
        ]


class AkathistSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Akathist

        fields = [
            "id",
            "title",
            "slug",
            "description",
            "is_visible",
        ]


class AkathistSerializer(serializers.ModelSerializer):
    sections = AkathistSectionSerializer(
        many=True,
        read_only=True,
    )

    troparion = TextSerializer(
        read_only=True,
    )

    kontakion_before = TextSerializer(
        read_only=True,
    )

    common_rule = serializers.SerializerMethodField()

    class Meta:
        model = Akathist
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "is_visible",
            "troparion",
            "kontakion_before",
            "common_rule",
            "sections",
        ]

    def get_common_rule(self, obj):
        rule = AkathistReadingRule.objects.filter(key="default").first()

        if not rule:
            return None

        return AkathistReadingRuleSerializer(rule).data


class AkathistReadingRuleSerializer(serializers.ModelSerializer):
    opening = TextSerializer(read_only=True)
    ending = TextSerializer(read_only=True)

    class Meta:
        model = AkathistReadingRule
        fields = [
            "id",
            "key",
            "opening",
            "ending",
        ]


# =========================================================
# КАНОНЫ
# =========================================================


class CanonSectionSerializer(serializers.ModelSerializer):
    text = TextSerializer(
        read_only=True,
    )

    class Meta:
        model = CanonSection

        fields = [
            "id",
            "section_type",
            "variant",
            "ode_number",
            "heading",
            "text",
            "order",
        ]


class CanonSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Canon

        fields = [
            "id",
            "title",
            "slug",
            "description",
            "tone",
            "is_visible",
        ]


class CanonSerializer(serializers.ModelSerializer):
    sections = CanonSectionSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = Canon

        fields = [
            "id",
            "title",
            "slug",
            "description",
            "tone",
            "is_visible",
            "sections",
        ]


# =========================================================
# ПОЛЬЗОВАТЕЛЬСКИЕ СБОРНИКИ
# =========================================================


class UserCollectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserCollection

        fields = [
            "id",
            "user",
            "name",
            "description",
            "is_default",
            "created_at",
        ]

        read_only_fields = [
            "user",
            "created_at",
        ]


class CollectionItemSerializer(serializers.ModelSerializer):
    text = TextSerializer(read_only=True)

    text_id = serializers.PrimaryKeyRelatedField(
        source="text",
        queryset=Text.objects.all(),
        write_only=True,
    )

    class Meta:
        model = CollectionItem

        fields = [
            "id",
            "collection",
            "text",
            "text_id",
            "order",
        ]

        read_only_fields = [
            "collection",
        ]


class BookmarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bookmark

        fields = [
            "id",
            "user",
            "text",
            "collection",
            "position",
            "created_at",
        ]

        read_only_fields = [
            "user",
            "created_at",
        ]


# =========================================================
# ЦИТАТА ДНЯ
# =========================================================


class DailyQuoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyQuote

        fields = [
            "id",
            "text",
            "source",
            "reference",
            "quote_date",
        ]


class SavedItemSerializer(serializers.ModelSerializer):
    save_type_display = serializers.CharField(
        source="get_save_type_display",
        read_only=True,
    )
    sync_id = serializers.UUIDField(required=False)

    class Meta:
        model = SavedItem

        fields = [
            "id",
            "save_type",
            "save_type_display",
            "source_type",
            "source_id",
            "anchor_type",
            "anchor_id",
            "source_title",
            "item_title",
            "text",
            "start_offset",
            "end_offset",
            "metadata",
            "created_at",
            "sync_id",
            "updated_at",
            "deleted_at",
        ]

        read_only_fields = [
            "id",
            "save_type_display",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        start = attrs.get("start_offset")

        end = attrs.get("end_offset")

        if start is not None and end is not None and end < start:
            raise serializers.ValidationError(
                {"end_offset": "Конец выделения не может быть раньше начала."}
            )

        return attrs


class ReadingProgressSerializer(serializers.ModelSerializer):
    anchor_info = serializers.SerializerMethodField()
    progress_percent = serializers.IntegerField(
        min_value=0,
        max_value=100,
        required=False,
    )

    class Meta:
        model = ReadingProgress

        fields = [
            "id",
            "source_type",
            "source_id",
            "anchor_type",
            "anchor_id",
            "offset",
            "anchor_info",
            "progress_percent",
            "metadata",
            "deleted_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "anchor_info",
        ]

    def get_anchor_info(self, obj):
        if obj.source_type == "canon" and obj.anchor_type == "canon_section" and obj.anchor_id:
            section = (
                CanonSection.objects.select_related(
                    "canon",
                )
                .filter(id=obj.anchor_id)
                .first()
            )

            if not section:
                return None

            return {
                "canon_id": section.canon_id,
                "canon_slug": section.canon.slug,
                "canon_title": section.canon.title,
                "section_id": section.id,
                "variant": section.variant,
                "section_type": section.section_type,
                "section_type_display": section.get_section_type_display(),
                "ode_number": section.ode_number,
                "heading": section.heading,
            }

        if obj.source_type == "psalter" and obj.anchor_type == "psalm" and obj.anchor_id:
            psalm = Psalm.objects.select_related("kathisma").filter(id=obj.anchor_id).first()

            if not psalm:
                return None

            return {
                "kathisma_id": psalm.kathisma.id,
                "kathisma_number": psalm.kathisma.number,
                "psalm_id": psalm.id,
                "psalm_number": psalm.number,
                "verse_id": None,
                "verse_number": None,
            }

        if obj.source_type == "psalter" and obj.anchor_type == "psalm_verse" and obj.anchor_id:
            verse = (
                PsalmVerse.objects.select_related("psalm__kathisma")
                .filter(id=obj.anchor_id)
                .first()
            )

            if not verse:
                return None

            return {
                "kathisma_id": verse.psalm.kathisma.id,
                "kathisma_number": verse.psalm.kathisma.number,
                "psalm_id": verse.psalm.id,
                "psalm_number": verse.psalm.number,
                "verse_id": verse.id,
                "verse_number": verse.number,
            }

        return None



# =========================================================
# ПОМЯННИК
# =========================================================


class MemorialPhotoSerializer(serializers.ModelSerializer):
    book_sync_id = serializers.UUIDField(
        source="book.sync_id",
        read_only=True,
    )
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MemorialPhoto
        fields = [
            "id",
            "sync_id",
            "book_sync_id",
            "original_name",
            "content_type",
            "order",
            "download_url",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "book_sync_id",
            "download_url",
            "created_at",
        ]

    def get_download_url(self, obj):
        if obj.deleted_at or not obj.storage_path:
            return ""

        try:
            return create_signed_download_url(obj.storage_path)
        except StorageConfigurationError:
            return ""
        except Exception:
            return ""


class MemorialBookSerializer(serializers.ModelSerializer):
    sync_id = serializers.UUIDField(required=False)
    photos = serializers.SerializerMethodField()

    class Meta:
        model = MemorialBook
        fields = [
            "id",
            "sync_id",
            "title",
            "health_names",
            "repose_names",
            "photos",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "photos",
            "created_at",
        ]

    def _validate_names(self, value):
        if value in [None, ""]:
            return []

        if not isinstance(value, list):
            raise serializers.ValidationError("Ожидается список имён.")

        if len(value) > 500:
            raise serializers.ValidationError("В одном разделе допускается до 500 имён.")

        result = []

        for raw_name in value:
            name = str(raw_name or "").strip()

            if not name:
                continue

            if len(name) > 100:
                raise serializers.ValidationError(
                    "Одно имя не должно быть длиннее 100 символов."
                )

            result.append(name)

        return result

    def validate_health_names(self, value):
        return self._validate_names(value)

    def validate_repose_names(self, value):
        return self._validate_names(value)

    def get_photos(self, obj):
        photos = obj.photos.filter(deleted_at__isnull=True).order_by(
            "order",
            "created_at",
            "id",
        )

        return MemorialPhotoSerializer(
            photos,
            many=True,
            context=self.context,
        ).data


# =========================================================
# ЛИЧНЫЙ МОЛИТВОСЛОВ
# =========================================================


class PersonalPrayerPhotoSerializer(serializers.ModelSerializer):
    prayer_sync_id = serializers.UUIDField(source="prayer.sync_id", read_only=True)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = PersonalPrayerPhoto
        fields = [
            "id",
            "sync_id",
            "prayer_sync_id",
            "original_name",
            "content_type",
            "order",
            "download_url",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = ["id", "prayer_sync_id", "download_url", "created_at"]

    def get_download_url(self, obj):
        if obj.deleted_at or not obj.storage_path:
            return ""
        try:
            return create_signed_download_url(obj.storage_path)
        except Exception:
            return ""


class PersonalPrayerSerializer(serializers.ModelSerializer):
    sync_id = serializers.UUIDField(required=False)
    photos = serializers.SerializerMethodField()

    class Meta:
        model = PersonalPrayer
        fields = [
            "id",
            "sync_id",
            "title",
            "text",
            "origin_type",
            "origin_data",
            "photos",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = ["id", "photos", "created_at"]

    def validate_title(self, value):
        value = str(value or "").strip()
        if not value:
            raise serializers.ValidationError("Укажите название молитвы.")
        return value

    def get_photos(self, obj):
        photos = obj.photos.filter(deleted_at__isnull=True).order_by(
            "order", "created_at", "id"
        )
        return PersonalPrayerPhotoSerializer(
            photos,
            many=True,
            context=self.context,
        ).data


class PersonalPrayerBookItemSerializer(serializers.ModelSerializer):
    sync_id = serializers.UUIDField(required=False)
    book_sync_id = serializers.UUIDField(source="book.sync_id", read_only=True)
    prayer_sync_id = serializers.UUIDField(source="prayer.sync_id", read_only=True)
    prayer = PersonalPrayerSerializer(read_only=True)

    class Meta:
        model = PersonalPrayerBookItem
        fields = [
            "id",
            "sync_id",
            "book_sync_id",
            "prayer_sync_id",
            "prayer",
            "order",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "book_sync_id",
            "prayer_sync_id",
            "prayer",
            "created_at",
        ]


class PersonalPrayerBookSerializer(serializers.ModelSerializer):
    sync_id = serializers.UUIDField(required=False)
    items = serializers.SerializerMethodField()

    class Meta:
        model = PersonalPrayerBook
        fields = [
            "id",
            "sync_id",
            "title",
            "description",
            "items",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = ["id", "items", "created_at"]

    def validate_title(self, value):
        value = str(value or "").strip()
        if not value:
            return "Мой молитвослов"
        return value

    def get_items(self, obj):
        items = (
            obj.items.filter(deleted_at__isnull=True)
            .select_related("prayer")
            .prefetch_related("prayer__photos")
            .order_by("order", "created_at", "id")
        )
        return PersonalPrayerBookItemSerializer(
            items,
            many=True,
            context=self.context,
        ).data
