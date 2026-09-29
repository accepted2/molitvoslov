from datetime import datetime
import os
import uuid
from zoneinfo import ZoneInfo
from django.db import IntegrityError, transaction
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
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
    MemorialBook,
    MemorialPhoto,
    Akathist,
    AkathistSection,
    Canon,
    CanonSection,
)

from .supabase_storage import (
    StorageConfigurationError,
    delete_object,
    upload_bytes,
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
    MemorialBookSerializer,
    MemorialPhotoSerializer,
    AkathistSerializer,
    AkathistSummarySerializer,
    AkathistSectionSerializer,
    CanonSerializer,
    CanonSummarySerializer,
    CanonSectionSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"

    @action(detail=True, methods=["get"])
    def texts(self, request, slug=None):
        category = get_object_or_404(Category, slug=slug)

        category_texts = CategoryText.objects.filter(category=category).select_related("text")

        serializer = CategoryTextSerializer(category_texts, many=True)

        return Response(serializer.data)


class TextViewSet(viewsets.ModelViewSet):
    queryset = Text.objects.filter(is_visible=True)

    serializer_class = TextSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = super().get_queryset().prefetch_related("categories")

        category = self.request.query_params.get("category")

        language = self.request.query_params.get("language")

        search = self.request.query_params.get("search")

        if category:
            queryset = queryset.filter(categories__slug=category)

        if language:
            queryset = queryset.filter(language=language)

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(content__icontains=search)
            )

        return queryset.distinct()

    @action(detail=True, methods=["get"])
    def categories(self, request, slug=None):
        text = self.get_object()

        categories = text.categories.all()

        serializer = CategorySerializer(categories, many=True)

        return Response(serializer.data)


# =========================================================
# МОЛИТВЕННЫЕ ПРАВИЛА
# =========================================================


class PrayerRuleViewSet(viewsets.ModelViewSet):
    queryset = PrayerRule.objects.filter(is_visible=True).prefetch_related(
        "items__text__categories",
        "footnotes",
    )

    serializer_class = PrayerRuleSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"


class PrayerRuleItemViewSet(viewsets.ModelViewSet):
    queryset = PrayerRuleItem.objects.select_related(
        "rule",
        "text",
    ).prefetch_related(
        "text__categories",
        "footnotes",
    )

    serializer_class = PrayerRuleItemSerializer
    permission_classes = [AllowAny]


# =========================================================
# ПСАЛТИРЬ
# =========================================================
class PsalterViewSet(viewsets.ModelViewSet):
    queryset = Psalter.objects.filter(is_visible=True).prefetch_related("kathismas__psalms")
    serializer_class = PsalterSerializer
    permission_classes = [AllowAny]

    lookup_field = "slug"


class KathismaViewSet(viewsets.ModelViewSet):
    queryset = Kathisma.objects.select_related("psalter").prefetch_related(
        "psalms__verses",
        "glories__after_psalm",
        "glories__after_verse",
    )
    serializer_class = KathismaSerializer
    permission_classes = [AllowAny]

    lookup_field = "number"


class PsalmViewSet(viewsets.ModelViewSet):
    queryset = Psalm.objects.select_related("kathisma", "kathisma__psalter").prefetch_related(
        "verses"
    )
    serializer_class = PsalmVerseSerializer
    permission_classes = [AllowAny]

    lookup_field = "number"


class PsalmVerseViewSet(viewsets.ModelViewSet):
    queryset = PsalmVerse.objects.select_related("psalm")

    serializer_class = PsalmSerializer
    permission_classes = [AllowAny]


class KathismaGloryViewSet(viewsets.ModelViewSet):
    queryset = KathismaGlory.objects.select_related(
        "kathisma",
        "after_psalm",
        "after_verse",
        "after_verse__psalm",
    )

    serializer_class = KathismaGlorySerializer
    permission_classes = [AllowAny]


# =========================================================
# АКАФИСТЫ
# =========================================================


class AkathistViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Akathist.objects.filter(is_visible=True)

        if self.action == "list":
            return queryset.only(
                "id",
                "title",
                "slug",
                "description",
                "is_visible",
            )

        return queryset.select_related(
            "troparion",
            "kontakion_before",
        ).prefetch_related("sections__text__categories")

    def get_serializer_class(self):
        if self.action == "list":
            return AkathistSummarySerializer

        return AkathistSerializer


class AkathistSectionViewSet(viewsets.ModelViewSet):
    queryset = AkathistSection.objects.select_related(
        "akathist",
        "text",
    ).prefetch_related("text__categories")

    serializer_class = AkathistSectionSerializer
    permission_classes = [AllowAny]


# =========================================================
# КАНОНЫ
# =========================================================


class CanonViewSet(viewsets.ModelViewSet):
    permission_classes = [
        AllowAny,
    ]

    lookup_field = "slug"

    def get_queryset(self):
        queryset = Canon.objects.filter(is_visible=True)

        if self.action == "list":
            return queryset.only(
                "id",
                "title",
                "slug",
                "description",
                "tone",
                "is_visible",
            )

        return queryset.prefetch_related("sections__text__categories")

    def get_serializer_class(self):
        if self.action == "list":
            return CanonSummarySerializer

        return CanonSerializer


class CanonSectionViewSet(viewsets.ModelViewSet):
    queryset = CanonSection.objects.select_related(
        "canon",
        "text",
    ).prefetch_related("text__categories")

    serializer_class = CanonSectionSerializer
    permission_classes = [
        AllowAny,
    ]


# =========================================================
# ПОЛЬЗОВАТЕЛЬСКИЕ СБОРНИКИ
# =========================================================


class UserCollectionViewSet(viewsets.ModelViewSet):
    serializer_class = UserCollectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserCollection.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def add_text(self, request, pk=None):
        collection = self.get_object()

        text_slug = request.data.get("text_slug")

        text = get_object_or_404(Text, slug=text_slug)

        if CollectionItem.objects.filter(collection=collection, text=text).exists():

            return Response(
                {"error": "Этот текст уже есть в сборнике"}, status=status.HTTP_400_BAD_REQUEST
            )

        max_order = (
            CollectionItem.objects.filter(collection=collection).aggregate(models.Max("order"))[
                "order__max"
            ]
            or 0
        )

        CollectionItem.objects.create(collection=collection, text=text, order=max_order + 1)

        return Response({"success": "Добавлено в сборник"}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"])
    def remove_text(self, request, pk=None):
        collection = self.get_object()

        text_slug = request.data.get("text_slug")

        text = get_object_or_404(Text, slug=text_slug)

        CollectionItem.objects.filter(collection=collection, text=text).delete()

        return Response({"success": "Удалено из сборника"})


class CollectionItemViewSet(viewsets.ModelViewSet):
    serializer_class = CollectionItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CollectionItem.objects.filter(collection__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save()


class BookmarkViewSet(viewsets.ModelViewSet):
    serializer_class = BookmarkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Bookmark.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# =========================================================
# ЦИТАТА ДНЯ
# =========================================================


class DailyQuoteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DailyQuote.objects.filter(is_active=True)

    serializer_class = DailyQuoteSerializer
    permission_classes = [AllowAny]

    @action(
        detail=False,
        methods=["get"],
    )
    def today(self, request):
        today = datetime.now(ZoneInfo("Europe/Kyiv")).date()

        quote = self.get_queryset().filter(quote_date=today).first()

        if quote is None:
            rotation_quotes = list(
                self.get_queryset()
                .filter(quote_date__isnull=True)
                .order_by(
                    "order",
                    "id",
                )
            )

            if rotation_quotes:
                index = today.toordinal() % len(rotation_quotes)

                quote = rotation_quotes[index]

        if quote is None:
            return Response(
                {"detail": "Цитаты дня пока не добавлены"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = self.get_serializer(quote).data

        data["date"] = today.isoformat()

        return Response(data)


class SavedItemViewSet(viewsets.ModelViewSet):
    serializer_class = SavedItemSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "sync_id"

    def get_queryset(self):
        queryset = SavedItem.objects.filter(
            user=self.request.user,
        ).order_by("-updated_at")

        include_deleted = self.request.query_params.get("include_deleted")

        if include_deleted not in ["1", "true", "True"]:
            queryset = queryset.filter(deleted_at__isnull=True)

        for field in [
            "source_type",
            "source_id",
            "anchor_type",
            "anchor_id",
            "save_type",
        ]:
            value = self.request.query_params.get(field)

            if value not in [None, ""]:
                queryset = queryset.filter(**{field: value})

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        sync_id = data.get("sync_id")

        if sync_id:
            existing = SavedItem.objects.filter(
                user=request.user,
                sync_id=sync_id,
            ).first()

            if existing:
                return Response(
                    self.get_serializer(existing).data,
                    status=status.HTTP_200_OK,
                )

        # Защита от дублей старых локальных сохранений,
        # созданных ещё до появления sync_id.
        existing = SavedItem.objects.filter(
            user=request.user,
            deleted_at__isnull=True,
            save_type=data["save_type"],
            source_type=data["source_type"],
            source_id=data["source_id"],
            anchor_type=data["anchor_type"],
            anchor_id=data["anchor_id"],
            start_offset=data.get("start_offset"),
            end_offset=data.get("end_offset"),
            metadata=data.get("metadata", {}),
        ).first()

        if existing:
            return Response(
                self.get_serializer(existing).data,
                status=status.HTTP_200_OK,
            )

        try:
            with transaction.atomic():
                saved_item = serializer.save(user=request.user)

        except IntegrityError:
            if sync_id:
                existing = SavedItem.objects.filter(
                    user=request.user,
                    sync_id=sync_id,
                ).first()

                if existing:
                    return Response(
                        self.get_serializer(existing).data,
                        status=status.HTTP_200_OK,
                    )

            raise

        return Response(
            self.get_serializer(saved_item).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(
            update_fields=[
                "deleted_at",
                "updated_at",
            ]
        )


class ReadingProgressViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingProgressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ReadingProgress.objects.filter(
            user=self.request.user,
        ).order_by("-updated_at")

        include_deleted = self.request.query_params.get("include_deleted")

        if include_deleted not in [
            "1",
            "true",
            "True",
        ]:
            queryset = queryset.filter(deleted_at__isnull=True)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        source_type = data["source_type"]
        source_id = data["source_id"]

        incoming_updated_at = data.get("updated_at") or timezone.now()

        existing = ReadingProgress.objects.filter(
            user=request.user,
            source_type=source_type,
            source_id=source_id,
        ).first()

        # Сервер уже имеет более свежую позицию.
        if existing and existing.updated_at and incoming_updated_at <= existing.updated_at:
            return Response(
                self.get_serializer(existing).data,
                status=status.HTTP_200_OK,
            )

        if existing:
            existing.anchor_type = data.get(
                "anchor_type",
                "",
            )

            existing.anchor_id = data.get("anchor_id")

            existing.offset = data.get(
                "offset",
                0,
            )

            existing.progress_percent = data.get(
                "progress_percent",
                0,
            )

            existing.metadata = data.get(
                "metadata",
                {},
            )

            existing.deleted_at = data.get("deleted_at")

            existing.updated_at = incoming_updated_at

            existing.save(
                update_fields=[
                    "anchor_type",
                    "anchor_id",
                    "offset",
                    "progress_percent",
                    "metadata",
                    "deleted_at",
                    "updated_at",
                ]
            )

            return Response(
                self.get_serializer(existing).data,
                status=status.HTTP_200_OK,
            )

        progress = serializer.save(
            user=request.user,
            updated_at=incoming_updated_at,
        )

        return Response(
            self.get_serializer(progress).data,
            status=status.HTTP_201_CREATED,
        )



# =========================================================
# ПОМЯННИК
# =========================================================


class MemorialBookViewSet(viewsets.ModelViewSet):
    serializer_class = MemorialBookSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "sync_id"

    def get_queryset(self):
        queryset = (
            MemorialBook.objects
            .filter(user=self.request.user)
            .prefetch_related("photos")
            .order_by("-updated_at", "-id")
        )

        include_deleted = self.request.query_params.get("include_deleted")

        if include_deleted not in ["1", "true", "True"]:
            queryset = queryset.filter(deleted_at__isnull=True)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = dict(serializer.validated_data)
        sync_id = data.get("sync_id")
        incoming_updated_at = data.get("updated_at") or timezone.now()

        existing = None

        if sync_id:
            existing = MemorialBook.objects.filter(
                user=request.user,
                sync_id=sync_id,
            ).first()

        if existing:
            if existing.updated_at and incoming_updated_at <= existing.updated_at:
                return Response(
                    self.get_serializer(existing).data,
                    status=status.HTTP_200_OK,
                )

            for field in [
                "title",
                "health_names",
                "repose_names",
                "deleted_at",
            ]:
                if field in data:
                    setattr(existing, field, data[field])

            existing.updated_at = incoming_updated_at
            existing.save(
                update_fields=[
                    "title",
                    "health_names",
                    "repose_names",
                    "deleted_at",
                    "updated_at",
                ]
            )

            return Response(
                self.get_serializer(existing).data,
                status=status.HTTP_200_OK,
            )

        book = serializer.save(
            user=request.user,
            updated_at=incoming_updated_at,
        )

        return Response(
            self.get_serializer(book).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        now = timezone.now()

        for photo in instance.photos.filter(deleted_at__isnull=True):
            try:
                delete_object(photo.storage_path)
            except Exception:
                pass

            photo.deleted_at = now
            photo.updated_at = now
            photo.save(
                update_fields=[
                    "deleted_at",
                    "updated_at",
                ]
            )

        instance.deleted_at = now
        instance.updated_at = now
        instance.save(
            update_fields=[
                "deleted_at",
                "updated_at",
            ]
        )


class MemorialPhotoViewSet(viewsets.ModelViewSet):
    serializer_class = MemorialPhotoSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [
        MultiPartParser,
        FormParser,
        JSONParser,
    ]
    lookup_field = "sync_id"

    def get_queryset(self):
        queryset = MemorialPhoto.objects.filter(
            book__user=self.request.user,
        ).select_related("book")

        book_sync_id = self.request.query_params.get("book_sync_id")

        if book_sync_id:
            queryset = queryset.filter(book__sync_id=book_sync_id)

        include_deleted = self.request.query_params.get("include_deleted")

        if include_deleted not in ["1", "true", "True"]:
            queryset = queryset.filter(deleted_at__isnull=True)

        return queryset.order_by("order", "created_at", "id")

    def create(self, request, *args, **kwargs):
        upload = request.FILES.get("file")

        if upload is None:
            return Response(
                {"detail": "Не передан файл изображения."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if upload.size > getattr(settings, "MEMORIAL_PHOTO_MAX_BYTES", 12 * 1024 * 1024):
            return Response(
                {"detail": "Файл слишком большой."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = str(
            getattr(upload, "content_type", "") or "application/octet-stream"
        ).lower()

        allowed_types = {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
        }

        if content_type not in allowed_types:
            return Response(
                {"detail": "Допускаются только JPG, PNG, WEBP, HEIC и HEIF."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_book_sync_id = request.data.get("book_sync_id")

        try:
            book_sync_id = uuid.UUID(str(raw_book_sync_id))
        except (TypeError, ValueError, AttributeError):
            return Response(
                {"detail": "Некорректный book_sync_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        book = get_object_or_404(
            MemorialBook,
            user=request.user,
            sync_id=book_sync_id,
            deleted_at__isnull=True,
        )

        raw_sync_id = request.data.get("sync_id")

        try:
            photo_sync_id = (
                uuid.UUID(str(raw_sync_id))
                if raw_sync_id
                else uuid.uuid4()
            )
        except (TypeError, ValueError, AttributeError):
            return Response(
                {"detail": "Некорректный sync_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = MemorialPhoto.objects.filter(
            book__user=request.user,
            sync_id=photo_sync_id,
        ).first()

        if existing and not existing.deleted_at:
            return Response(
                self.get_serializer(existing).data,
                status=status.HTTP_200_OK,
            )

        extension = os.path.splitext(upload.name or "")[1].lower()

        extension_by_type = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/heic": ".heic",
            "image/heif": ".heif",
        }

        if extension not in {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
            ".heic",
            ".heif",
        }:
            extension = extension_by_type.get(content_type, ".jpg")

        storage_path = (
            f"user-{request.user.id}/"
            f"{book.sync_id}/"
            f"{photo_sync_id}{extension}"
        )

        try:
            upload_bytes(
                storage_path,
                upload.read(),
                content_type,
            )
        except StorageConfigurationError as error:
            return Response(
                {"detail": str(error)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as error:
            return Response(
                {"detail": f"Не удалось загрузить фото: {error}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            order = max(
                0,
                int(request.data.get("order", 0)),
            )
        except (TypeError, ValueError):
            order = 0

        now = timezone.now()

        if existing:
            existing.book = book
            existing.storage_path = storage_path
            existing.original_name = upload.name or ""
            existing.content_type = content_type
            existing.order = order
            existing.deleted_at = None
            existing.updated_at = now
            existing.save()
            photo = existing
        else:
            photo = MemorialPhoto.objects.create(
                book=book,
                sync_id=photo_sync_id,
                storage_path=storage_path,
                original_name=upload.name or "",
                content_type=content_type,
                order=order,
                updated_at=now,
            )

        return Response(
            self.get_serializer(photo).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        try:
            delete_object(instance.storage_path)
        except Exception:
            pass

        now = timezone.now()
        instance.deleted_at = now
        instance.updated_at = now
        instance.save(
            update_fields=[
                "deleted_at",
                "updated_at",
            ]
        )
