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
        fields = ['id','number','title','psalms','glories',]

class KathismaSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Kathisma
        fields = ['id','number','title',]

class PsalterSerializer(serializers.ModelSerializer):
    kathismas = KathismaSummarySerializer(many=True,read_only=True)

    class Meta:
        model = Psalter
        fields = ['id','name','slug','description','is_visible','kathismas']

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