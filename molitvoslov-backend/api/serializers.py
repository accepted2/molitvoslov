from rest_framework import serializers

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
    ReadingProgress,
    DailyQuote,
    SavedItem,
    AkathistReadingRule,

Psalter,Kathisma,Psalm,PsalmVerse,KathismaGlory
)

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'slug',
            'parent',
            'order',
            'icon',
        ]

class TextSerializer(serializers.ModelSerializer):
    categories = CategorySerializer(
        many=True,
        read_only=True
    )

    category_ids = serializers.PrimaryKeyRelatedField(
        source='categories',
        queryset=Category.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )

    class Meta:
        model = Text

        fields = [
            'id',
            'title',
            'description',
            'content',
            'translation',
            'categories',
            'description_position',
            'category_ids',
            'language',
            'slug',
        ]

class CategoryTextSerializer(serializers.ModelSerializer):
    text = TextSerializer(
        read_only=True
    )

    category = CategorySerializer(
        read_only=True
    )

    class Meta:
        model = CategoryText

        fields = [
            'id',
            'category',
            'text',
            'order',
        ]

# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================
class PrayerRuleFootnoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrayerRuleFootnote
        fields = [
            'id',
            'number',
            'content',
        ]

class PrayerRuleItemSerializer(serializers.ModelSerializer):
    text = TextSerializer(
        read_only=True
    )

    footnotes = PrayerRuleFootnoteSerializer(
        many=True,
        read_only=True
    )

    text_id = serializers.PrimaryKeyRelatedField(
        source='text',
        queryset=Text.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    rule_id = serializers.PrimaryKeyRelatedField(
        source='rule',
        queryset=PrayerRule.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = PrayerRuleItem

        fields = [
            'id',
            'rule_id',
            'item_type',
            'text',
            'text_id',
            'title',
            'content',
            'note',
            'footnotes',
            'order',
        ]

    def validate(self, attrs):
        item_type = attrs.get(
            'item_type',
            getattr(
                self.instance,
                'item_type',
                PrayerRuleItem.TYPE_TEXT
            )
        )

        text = attrs.get(
            'text',
            getattr(
                self.instance,
                'text',
                None
            )
        )

        if (
                item_type == PrayerRuleItem.TYPE_TEXT
                and text is None
        ):
            raise serializers.ValidationError({
                'text_id':
                    'Для элемента типа text необходимо указать текст.'
            })

        if (
                item_type in [
            PrayerRuleItem.TYPE_INSTRUCTION,
            PrayerRuleItem.TYPE_SECTION,
        ]
                and text is not None
        ):
            raise serializers.ValidationError({
                'text_id':
                    'Для инструкции или раздела Text указывать не нужно.'
            })

        return attrs

class PrayerRuleSerializer(serializers.ModelSerializer):
    items = PrayerRuleItemSerializer(
        many=True,
        read_only=True
    )

    footnotes = PrayerRuleFootnoteSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = PrayerRule

        fields = [
            'id',
            'name',
            'slug',
            'description',
            'is_visible',
            'items',
            'footnotes',
        ]

# =========================================================
# ПСАЛТИРь
# =========================================================
class PsalmVerseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PsalmVerse
        fields = ['id','number','church_slavonic','russian']

class PsalmSerializer(serializers.ModelSerializer):
    verses = PsalmVerseSerializer(many=True,read_only=True)

    class Meta:
        model = Psalm
        fields = ['id','number','title_church_slavonic','title_russian','description','verses',]

class KathismaGlorySerializer(serializers.ModelSerializer):
    after_psalm_number = serializers.IntegerField(source='after_psalm.number',read_only=True)
    after_verse_number = serializers.IntegerField(source='after_verse.number',read_only=True)

    class Meta:
        model = KathismaGlory

        fields =['id','number','after_psalm','after_psalm_number','after_verse','after_verse_number',]

class KathismaSerializer(serializers.ModelSerializer):
    psalms = PsalmSerializer(
        many=True,
        read_only=True
    )
    glories = KathismaGlorySerializer(many=True,read_only=True)

    class Meta:
        model = Kathisma
        fields = ['id','psalter','number','title','prayers_after','psalms','glories',]

class KathismaSummarySerializer(serializers.ModelSerializer):
    first_psalm = serializers.SerializerMethodField()
    last_psalm = serializers.SerializerMethodField()

    class Meta:
        model = Kathisma
        fields = [
            'id',
            'number',
            'title',
            'first_psalm',
            'last_psalm',
        ]

    def get_first_psalm(self, obj):
        psalm = obj.psalms.order_by('number').first()

        if psalm:
            return psalm.number

        return None

    def get_last_psalm(self, obj):
        psalm = obj.psalms.order_by('-number').first()

        if psalm:
            return psalm.number

        return None

class PsalterSerializer(serializers.ModelSerializer):
    kathismas = KathismaSummarySerializer(many=True,read_only=True)

    class Meta:
        model = Psalter
        fields = ['id','name','slug','description','prayers_before', 'prayers_after','is_visible','kathismas']

# =========================================================
# АКАФИСТЫ
# =========================================================

class AkathistSectionSerializer(serializers.ModelSerializer):
    text = TextSerializer(
        read_only=True
    )

    text_id = serializers.PrimaryKeyRelatedField(
        source='text',
        queryset=Text.objects.all(),
        write_only=True,
        required=True,
    )

    class Meta:
        model = AkathistSection

        fields = [
            'id',
            'section_type',
            'number',
            'text',
            'text_id',
            'note',
            'order',
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
            'id',
            'title',
            'slug',
            'description',
            'is_visible',
            'troparion',
            'kontakion_before',
            'common_rule',
            'sections',
        ]

    def get_common_rule(self, obj):
        rule = AkathistReadingRule.objects.filter(
            key='default'
        ).first()

        if not rule:
            return None

        return AkathistReadingRuleSerializer(
            rule
        ).data

class AkathistReadingRuleSerializer(serializers.ModelSerializer):
    opening = TextSerializer(read_only=True)
    ending = TextSerializer(read_only=True)

    class Meta:
        model = AkathistReadingRule
        fields = [
            'id',
            'key',
            'opening',
            'ending',
        ]

# =========================================================
# ПОЛЬЗОВАТЕЛЬСКИЕ СБОРНИКИ
# =========================================================

class UserCollectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserCollection

        fields = [
            'id',
            'user',
            'name',
            'description',
            'is_default',
            'created_at',
        ]

        read_only_fields = [
            'user',
            'created_at',
        ]

class CollectionItemSerializer(serializers.ModelSerializer):
    text = TextSerializer(
        read_only=True
    )

    text_id = serializers.PrimaryKeyRelatedField(
        source='text',
        queryset=Text.objects.all(),
        write_only=True,
    )

    class Meta:
        model = CollectionItem

        fields = [
            'id',
            'collection',
            'text',
            'text_id',
            'order',
        ]

        read_only_fields = [
            'collection',
        ]

class BookmarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bookmark

        fields = [
            'id',
            'user',
            'text',
            'collection',
            'position',
            'created_at',
        ]

        read_only_fields = [
            'user',
            'created_at',
        ]


# =========================================================
# ЦИТАТА ДНЯ
# =========================================================

class DailyQuoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyQuote

        fields = [
            'id',
            'text',
            'source',
            'reference',
            'quote_date',
        ]


class SavedItemSerializer(serializers.ModelSerializer):
    save_type_display = serializers.CharField(
        source='get_save_type_display',
        read_only=True,
    )

    class Meta:
        model = SavedItem

        fields = [
            'id',
            'save_type',
            'save_type_display',
            'source_type',
            'source_id',
            'anchor_type',
            'anchor_id',
            'source_title',
            'item_title',
            'text',
            'start_offset',
            'end_offset',
            'metadata',
            'created_at',
        ]

        read_only_fields = [
            'id',
            'save_type_display',
            'created_at',
        ]

    def validate(self, attrs):
        start = attrs.get(
            'start_offset'
        )

        end = attrs.get(
            'end_offset'
        )

        if (
                start is not None
                and end is not None
                and end < start
        ):
            raise serializers.ValidationError(
                {
                    'end_offset':
                        'Конец выделения не может быть раньше начала.'
                }
            )

        saved_text = (
            attrs.get(
                'text',
                ''
            )
            or ''
        )

        if len(saved_text) > 500:
            raise serializers.ValidationError(
                {
                    'text':
                        'Можно сохранить не более 500 символов.'
                }
            )

        return attrs

class ReadingProgressSerializer(serializers.ModelSerializer):
    anchor_info = serializers.SerializerMethodField()
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = ReadingProgress

        fields = [
            'id',
            'source_type',
            'source_id',
            'anchor_type',
            'anchor_id',
            'offset',
            'anchor_info',
            'progress_percent',
            'updated_at',
        ]

        read_only_fields = [
            'id',
            'anchor_info',
            'updated_at',
        ]

    def get_progress_percent(self, obj):
        if not obj.anchor_id:
            return 0

        queryset = None

        if (
                obj.source_type == 'psalter'
                and obj.anchor_type == 'psalm_verse'
        ):
            queryset = (
                PsalmVerse.objects
                .filter(
                    psalm__kathisma__psalter_id=obj.source_id
                )
                .order_by(
                    'psalm__kathisma__number',
                    'psalm__number',
                    'number',
                    'id',
                )
            )

        elif (
                obj.source_type == 'akathist'
                and obj.anchor_type == 'akathist_section'
        ):
            queryset = (
                AkathistSection.objects
                .filter(
                    akathist_id=obj.source_id
                )
                .order_by(
                    'order',
                    'id',
                )
            )

        elif (
                obj.source_type == 'prayer_rule'
                and obj.anchor_type == 'prayer_rule_item'
        ):
            queryset = (
                PrayerRuleItem.objects
                .filter(
                    rule_id=obj.source_id
                )
                .order_by(
                    'order',
                    'id',
                )
            )

        elif (
                obj.source_type == 'category'
                and obj.anchor_type == 'category_text'
        ):
            queryset = (
                CategoryText.objects
                .filter(
                    category_id=obj.source_id
                )
                .order_by(
                    'order',
                    'id',
                )
            )

        if queryset is None:
            return 0

        ids = list(
            queryset.values_list(
                'id',
                flat=True,
            )
        )

        if not ids:
            return 0

        try:
            position = (
                ids.index(obj.anchor_id)
                + 1
            )
        except ValueError:
            return 0

        percent = round(
            position
            * 100
            / len(ids)
        )

        return max(
            1,
            min(
                percent,
                100,
            ),
        )

    def get_anchor_info(self, obj):
        if (
                obj.source_type == 'psalter'
                and obj.anchor_type == 'psalm_verse'
                and obj.anchor_id
        ):
            verse = (
                PsalmVerse.objects
                .select_related(
                    'psalm__kathisma'
                )
                .filter(id=obj.anchor_id)
                .first()
            )

            if not verse:
                return None

            return {
                'kathisma_id':
                    verse.psalm.kathisma.id,

                'kathisma_number':
                    verse.psalm.kathisma.number,

                'psalm_id':
                    verse.psalm.id,

                'psalm_number':
                    verse.psalm.number,

                'verse_id':
                    verse.id,

                'verse_number':
                    verse.number,
            }

        return None