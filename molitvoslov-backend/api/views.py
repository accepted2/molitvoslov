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
    queryset=(Psalter.objects.filter(is_visible=True).prefetch_related('kathismas'))
    serializer_class = PsalterSerializer
    permission_classes = [AllowAny]

    lookup_field = 'slug'

class KathismaViewSet(viewsets.ModelViewSet):
    queryset = (
        Kathisma.objects.select_related('psalter').prefetch_related(
            'psalms_verses',
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