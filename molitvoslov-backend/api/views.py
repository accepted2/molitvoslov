from datetime import datetime
from zoneinfo import ZoneInfo

from django.db import models
from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import (
    IsAuthenticated,
    AllowAny,
)

from .models import (
    Category,
    Text,
    CategoryText,
    PrayerRule,
    PrayerRuleItem,
    UserCollection,
    CollectionItem,
    Bookmark,
    Psalter,
    Kathisma,
    Psalm,
    PsalmVerse,
    KathismaGlory,
    ReadingProgress,
    DailyQuote,
    SavedItem,
    Akathist,
    AkathistSection,

)

from .serializers import (
    CategorySerializer,
    TextSerializer,
    CategoryTextSerializer,
    PrayerRuleSerializer,
    PrayerRuleItemSerializer,
    UserCollectionSerializer,
    CollectionItemSerializer,
    BookmarkSerializer,
    PsalterSerializer,
    KathismaSerializer,
    PsalmSerializer,
    PsalmVerseSerializer,
    KathismaGlorySerializer,
    ReadingProgressSerializer,
    DailyQuoteSerializer,
    SavedItemSerializer,
    AkathistSerializer,
    AkathistSectionSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    lookup_field = 'slug'

    @action(
        detail=True,
        methods=['get']
    )
    def texts(self, request, slug=None):
        category = get_object_or_404(
            Category,
            slug=slug
        )

        category_texts = (
            CategoryText.objects
            .filter(category=category)
            .select_related('text')
        )

        serializer = CategoryTextSerializer(
            category_texts,
            many=True
        )

        return Response(serializer.data)

class TextViewSet(viewsets.ModelViewSet):
    queryset = Text.objects.filter(
        is_visible=True
    )

    serializer_class = TextSerializer
    permission_classes = [AllowAny]
    lookup_field = 'slug'

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .prefetch_related('categories')
        )

        category = self.request.query_params.get(
            'category'
        )

        language = self.request.query_params.get(
            'language'
        )

        search = self.request.query_params.get(
            'search'
        )

        if category:
            queryset = queryset.filter(
                categories__slug=category
            )

        if language:
            queryset = queryset.filter(
                language=language
            )

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                |
                Q(description__icontains=search)
                |
                Q(content__icontains=search)
            )

        return queryset.distinct()

    @action(
        detail=True,
        methods=['get']
    )
    def categories(self, request, slug=None):
        text = self.get_object()

        categories = text.categories.all()

        serializer = CategorySerializer(
            categories,
            many=True
        )

        return Response(serializer.data)

# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================

class PrayerRuleViewSet(viewsets.ModelViewSet):
    queryset = (
        PrayerRule.objects
        .filter(is_visible=True)
        .prefetch_related(
            'items__text__categories',
            'footnotes',
        )
    )

    serializer_class = PrayerRuleSerializer
    permission_classes = [AllowAny]
    lookup_field = 'slug'

class PrayerRuleItemViewSet(viewsets.ModelViewSet):
    queryset = (
        PrayerRuleItem.objects
        .select_related(
            'rule',
            'text',
        )
        .prefetch_related(
            'text__categories',
            'footnotes',
        )
    )

    serializer_class = PrayerRuleItemSerializer
    permission_classes = [AllowAny]

# =========================================================
# ПСАЛТИРЬ
# =========================================================
class PsalterViewSet(viewsets.ModelViewSet):
    queryset=(Psalter.objects.filter(is_visible=True).prefetch_related('kathismas__psalms'))
    serializer_class = PsalterSerializer
    permission_classes = [AllowAny]

    lookup_field = 'slug'

class KathismaViewSet(viewsets.ModelViewSet):
    queryset = (
        Kathisma.objects.select_related('psalter').prefetch_related(
            'psalms__verses',
            'glories__after_psalm',
            'glories__after_verse',
        )
    )
    serializer_class = KathismaSerializer
    permission_classes = [AllowAny]

    lookup_field = 'number'

class PsalmViewSet(viewsets.ModelViewSet):
    queryset = (Psalm.objects.select_related('kathisma','kathisma__psalter').prefetch_related('verses'))
    serializer_class = PsalmVerseSerializer
    permission_classes = [AllowAny]

    lookup_field = 'number'

class PsalmVerseViewSet(viewsets.ModelViewSet):
    queryset = (PsalmVerse.objects.select_related('psalm'))

    serializer_class = PsalmSerializer
    permission_classes=[AllowAny]

class KathismaGloryViewSet(viewsets.ModelViewSet):
    queryset = (KathismaGlory.objects.select_related('kathisma','after_psalm','after_verse','after_verse__psalm',))

    serializer_class = KathismaGlorySerializer
    permission_classes = [AllowAny]

# =========================================================
# АКАФИСТЫ
# =========================================================

class AkathistViewSet(viewsets.ModelViewSet):
    queryset = (
        Akathist.objects
        .filter(is_visible=True)
        .prefetch_related(
            'sections__text__categories'
        )
    )

    serializer_class = AkathistSerializer
    permission_classes = [AllowAny]

    lookup_field = 'slug'


class AkathistSectionViewSet(viewsets.ModelViewSet):
    queryset = (
        AkathistSection.objects
        .select_related(
            'akathist',
            'text',
        )
        .prefetch_related(
            'text__categories'
        )
    )

    serializer_class = AkathistSectionSerializer
    permission_classes = [AllowAny]

# =========================================================
# ПОЛЬЗОВАТЕЛЬСКИЕ СБОРНИКИ
# =========================================================

class UserCollectionViewSet(viewsets.ModelViewSet):
    serializer_class = UserCollectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserCollection.objects.filter(
            user=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user
        )

    @action(
        detail=True,
        methods=['post']
    )
    def add_text(self, request, pk=None):
        collection = self.get_object()

        text_slug = request.data.get(
            'text_slug'
        )

        text = get_object_or_404(
            Text,
            slug=text_slug
        )

        if CollectionItem.objects.filter(
                collection=collection,
                text=text
        ).exists():

            return Response(
                {
                    'error':
                        'Этот текст уже есть в сборнике'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        max_order = (
                CollectionItem.objects
                .filter(collection=collection)
                .aggregate(
                    models.Max('order')
                )['order__max']
                or 0
        )

        CollectionItem.objects.create(
            collection=collection,
            text=text,
            order=max_order + 1
        )

        return Response(
            {
                'success':
                    'Добавлено в сборник'
            },
            status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=['delete']
    )
    def remove_text(self, request, pk=None):
        collection = self.get_object()

        text_slug = request.data.get(
            'text_slug'
        )

        text = get_object_or_404(
            Text,
            slug=text_slug
        )

        CollectionItem.objects.filter(
            collection=collection,
            text=text
        ).delete()

        return Response({
            'success':
                'Удалено из сборника'
        })

class CollectionItemViewSet(viewsets.ModelViewSet):
    serializer_class = CollectionItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CollectionItem.objects.filter(
            collection__user=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save()

class BookmarkViewSet(viewsets.ModelViewSet):
    serializer_class = BookmarkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Bookmark.objects.filter(
            user=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user
        )


# =========================================================
# ЦИТАТА ДНЯ
# =========================================================

class DailyQuoteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DailyQuote.objects.filter(
        is_active=True
    )

    serializer_class = DailyQuoteSerializer
    permission_classes = [AllowAny]

    @action(
        detail=False,
        methods=['get'],
    )
    def today(self, request):
        today = datetime.now(
            ZoneInfo('Europe/Kyiv')
        ).date()

        quote = (
            self.get_queryset()
            .filter(
                quote_date=today
            )
            .first()
        )

        if quote is None:
            rotation_quotes = list(
                self.get_queryset()
                .filter(
                    quote_date__isnull=True
                )
                .order_by(
                    'order',
                    'id',
                )
            )

            if rotation_quotes:
                index = (
                    today.toordinal()
                    % len(rotation_quotes)
                )

                quote = rotation_quotes[
                    index
                ]

        if quote is None:
            return Response(
                {
                    'detail':
                        'Цитаты дня пока не добавлены'
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        data = self.get_serializer(
            quote
        ).data

        data['date'] = (
            today.isoformat()
        )

        return Response(data)


class SavedItemViewSet(viewsets.ModelViewSet):
    serializer_class = SavedItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = (
            SavedItem.objects
            .filter(
                user=self.request.user
            )
            .order_by(
                '-created_at'
            )
        )

        for field in [
            'source_type',
            'source_id',
            'anchor_type',
            'anchor_id',
            'save_type',
        ]:
            value = (
                self.request
                .query_params
                .get(field)
            )

            if value not in [
                None,
                '',
            ]:
                queryset = queryset.filter(
                    **{
                        field:
                            value
                    }
                )

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        data = (
            serializer.validated_data
        )

        existing = (
            SavedItem.objects
            .filter(
                user=request.user,
                save_type=
                    data['save_type'],
                source_type=
                    data['source_type'],
                source_id=
                    data['source_id'],
                anchor_type=
                    data['anchor_type'],
                anchor_id=
                    data['anchor_id'],
                start_offset=
                    data.get(
                        'start_offset'
                    ),
                end_offset=
                    data.get(
                        'end_offset'
                    ),
            )
            .first()
        )

        if existing:
            return Response(
                self.get_serializer(
                    existing
                ).data,
                status=
                    status.HTTP_200_OK,
            )

        saved_item = (
            serializer.save(
                user=request.user
            )
        )

        return Response(
            self.get_serializer(
                saved_item
            ).data,
            status=
                status.HTTP_201_CREATED,
        )

class ReadingProgressViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingProgressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReadingProgress.objects.filter(user=self.request.user).order_by('-updated_at')

    def create(self, request, *args, **kwargs):
        source_type = request.data.get('source_type')
        source_id = request.data.get('source_id')

        if not source_type or not source_id:
            return  Response({
                'detail':'source_type и source_id обяхательны'
            }, status=status.HTTP_400_BAD_REQUEST,

            )
        progress, created = (ReadingProgress.objects.update_or_create(
            user=request.user,
            source_type=source_type,
            source_id=source_id,
            defaults={'anchor_type':request.data.get('anchor_type',''),
                      'anchor_id':request.data.get('anchor_id'),
                      'offset': request.data.get('offset', 0),

                      }
        ))
        serializer = self.get_serializer(progress)

        return Response(serializer.data,status=(status.HTTP_201_CREATED
                                                if created
                                                else status.HTTP_200_OK
                                                ))