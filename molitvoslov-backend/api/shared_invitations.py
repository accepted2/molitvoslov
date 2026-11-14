"""Opt-in expiring shares of texts, memorials and personal prayer books.

Anyone holding an unexpired token can preview its snapshot. Only a signed-in
recipient can import an independent copy; the owner's live account is private.
Photos are intentionally NEVER included.
"""
import hashlib
import secrets
import uuid
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .supabase_storage import (
    download_bytes, upload_bytes, delete_object, StorageConfigurationError,
)
from .models import (
    MemorialBook, MemorialPhoto, PersonalPrayerPhoto,
    PersonalPrayer,
    PersonalPrayerBook,
    PersonalPrayerBookItem,
    SavedItem,
    SharedContentImport,
    SharedContentInvitation,
)


def _hash(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _invitation(token, *, lock=False):
    if not isinstance(token, str) or len(token) != 43 or not all(
        char.isalnum() or char in "-_" for char in token
    ):
        return None
    query = SharedContentInvitation.objects
    if lock:
        query = query.select_for_update()
    return query.filter(
        token_hash=_hash(token),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).first()


def _clean_title(value, fallback, limit=180):
    return str(value or "").strip()[:limit] or fallback


def _quote(request):
    text = str(request.data.get("text") or "").strip()
    if not text or len(text) > 16000:
        raise ValueError("Цитата должна содержать от 1 до 16000 символов.")
    return _clean_title(request.data.get("title"), "Цитата"), {"text": text}


def _source_uuid(request):
    try:
        return uuid.UUID(str(request.data.get("source_sync_id")))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Не указан корректный ID для отправки.")


# A bounded photo snapshot stays inside the authenticated invitation API.
# The public landing page never receives storage paths, names, or image data.
MAX_SHARED_PHOTOS = 12
PHOTO_MAX_BYTES = 4 * 1024 * 1024
PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def _photo_snapshot(photos):
    photos=list(photos)
    if len(photos)>MAX_SHARED_PHOTOS:
        raise ValueError(
            "Для одной ссылки допускается не более 12 фотографий. "
            "Удалите лишние или отправьте материалы частями."
        )
    result=[]
    for photo in photos:
        if photo.content_type not in PHOTO_TYPES or not photo.storage_path:
            raise ValueError("Некоторые фотографии ещё не загружены или имеют неподдерживаемый формат.")
        result.append({
            "storage_path": photo.storage_path,
            "content_type": photo.content_type,
            "original_name": photo.original_name,
            "order": photo.order,
        })
    return result


def _copy_photo(source, *, user, book=None, prayer=None, uploaded):
    content_type=source["content_type"]
    extension=PHOTO_TYPES.get(content_type)
    if not extension:
        raise ValueError("Неподдерживаемый формат фотографии.")
    bytes_value=download_bytes(source["storage_path"], max_bytes=PHOTO_MAX_BYTES)
    photo_id=uuid.uuid4()
    if book is not None:
        target=f"user-{user.pk}/{book.sync_id}/{photo_id}{extension}"
    else:
        target=(f"user-{user.pk}/personal-prayers/"
                f"{prayer.sync_id}/{photo_id}{extension}")
    # Register before upload: a timed-out Storage request might still have
    # written the object, and compensation should remove that orphan too.
    uploaded.append(target)
    upload_bytes(target,bytes_value,content_type)
    attrs={
        "sync_id": photo_id,
        "storage_path": target,
        "content_type": content_type,
        "original_name": str(source.get("original_name") or "")[:255],
        "order": max(0,int(source.get("order",0))),
    }
    if book is not None:
        MemorialPhoto.objects.create(book=book,**attrs)
    else:
        PersonalPrayerPhoto.objects.create(prayer=prayer,**attrs)


def _memorial(request):
    sync_id = _source_uuid(request)
    book = get_object_or_404(
        MemorialBook, sync_id=sync_id, user=request.user,
        deleted_at__isnull=True,
    )
    photos=_photo_snapshot(book.photos.filter(
        deleted_at__isnull=True).order_by("order","id"))
    return _clean_title(book.title, "Помянник"), {
        "health_names": book.health_names,
        "repose_names": book.repose_names,
        "photos": photos,
    }


def _prayerbook(request):
    sync_id = _source_uuid(request)
    book = get_object_or_404(
        PersonalPrayerBook, sync_id=sync_id, user=request.user,
        deleted_at__isnull=True,
    )
    rows = (
        PersonalPrayerBookItem.objects.filter(
            book=book, deleted_at__isnull=True,
            prayer__user=request.user, prayer__deleted_at__isnull=True,
        ).select_related("prayer").order_by("order", "id")
    )
    prayers = []
    size = 0
    total_photos = 0
    for entry in rows:
        prayer = entry.prayer
        title = _clean_title(prayer.title, "Молитва", 255)
        body = str(prayer.text or "")
        size += len(title) + len(body)
        if len(prayers) >= 100 or size > 250000:
            raise ValueError(
                "Молитвослов слишком большой для отправки одной ссылкой."
            )
        images=_photo_snapshot(prayer.photos.filter(
            deleted_at__isnull=True).order_by("order","id"))
        total_photos += len(images)
        if total_photos > MAX_SHARED_PHOTOS:
            raise ValueError("Для одной ссылки допускается не более 12 фотографий.")
        prayers.append({"title": title, "text": body, "photos": images})
    return _clean_title(book.title, "Мой молитвослов"), {
        "description": str(book.description or "")[:2000],
        "prayers": prayers,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_shared_invitation(request):
    kind = request.data.get("kind")
    handlers = {
        "quote": _quote,
        "memorial": _memorial,
        "prayerbook": _prayerbook,
    }
    handler = handlers.get(kind)
    if handler is None:
        return Response({"detail": "Неизвестный тип содержимого."},
                        status=status.HTTP_400_BAD_REQUEST)
    # Prevent unlimited materialization of personal snapshots.
    if SharedContentInvitation.objects.filter(
        owner=request.user,
        created_at__gte=timezone.now() - timedelta(hours=24),
    ).count() >= 30:
        return Response({"detail": "Слишком много приглашений за сутки."},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)
    try:
        title, snapshot = handler(request)
    except ValueError as exc:
        return Response({"detail": str(exc)},
                        status=status.HTTP_400_BAD_REQUEST)
    token = secrets.token_urlsafe(32)  # 256 random bits, URL-safe
    expires_at = timezone.now() + timedelta(days=7)
    SharedContentInvitation.objects.create(
        owner=request.user, token_hash=_hash(token),
        kind=kind, title=title, snapshot=snapshot, expires_at=expires_at,
    )
    return Response({
        "token": token,
        "kind": kind,
        "title": title,
        "expires_at": expires_at.isoformat(),
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def preview_shared_invitation(request, token):
    invite = _invitation(token)
    if not invite:
        return Response({"detail": "Ссылка недействительна или истекла."},
                        status=status.HTTP_404_NOT_FOUND)
    snap = invite.snapshot
    summary = (
        {"text": snap["text"]}
        if invite.kind == "quote" else
        {"health_names": snap["health_names"],
         "repose_names": snap["repose_names"],
         "photo_count": len(snap.get("photos",[]))}
        if invite.kind == "memorial" else
        {"description": snap.get("description", ""),
         "prayers": [{"title":item["title"],"text":item["text"],
                      "photo_count":len(item.get("photos",[]))}
                     for item in snap["prayers"]]}
    )
    return Response({
        "kind": invite.kind,
        "title": invite.title,
        "content": summary,
        "expires_at": invite.expires_at.isoformat(),
        "imported": (
            request.user.is_authenticated and
            SharedContentImport.objects.filter(
                invitation=invite, recipient=request.user,
            ).exists()
        ),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_shared_invitation(request, token):
    uploaded=[]
    try:
        with transaction.atomic():
            invite=_invitation(token,lock=True)
            if not invite:
                return Response(
                    {"detail":"Ссылка недействительна или истекла."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            existing=SharedContentImport.objects.filter(
                invitation=invite,recipient=request.user,
            ).first()
            if existing:
                return Response({
                    "kind":existing.kind,
                    "sync_id":str(existing.imported_sync_id),
                    "already_imported":True,
                })
            snap=invite.snapshot
            if invite.kind=="quote":
                saved=SavedItem.objects.create(
                    user=request.user,save_type="quote",
                    source_type="shared_quote",source_id=0,
                    anchor_type="shared_quote",anchor_id=0,
                    source_title="Полученная цитата",
                    item_title=invite.title,text=snap["text"],
                    metadata={"shared_copy":True},
                )
                imported_sync_id=saved.sync_id
            elif invite.kind=="memorial":
                memorial=MemorialBook.objects.create(
                    user=request.user,title=invite.title,
                    health_names=list(snap["health_names"]),
                    repose_names=list(snap["repose_names"]),
                )
                imported_sync_id=memorial.sync_id
                for photo in snap.get("photos",[]):
                    _copy_photo(photo,user=request.user,book=memorial,
                                uploaded=uploaded)
            else:
                book=PersonalPrayerBook.objects.create(
                    user=request.user,title=invite.title,
                    description=snap.get("description",""),
                )
                for number,source in enumerate(snap["prayers"]):
                    prayer=PersonalPrayer.objects.create(
                        user=request.user,title=source["title"],
                        text=source["text"],origin_type="custom",
                        origin_data={"shared_copy":True},
                    )
                    PersonalPrayerBookItem.objects.create(
                        book=book,prayer=prayer,order=number,
                    )
                    for photo in source.get("photos",[]):
                        _copy_photo(photo,user=request.user,prayer=prayer,
                                    uploaded=uploaded)
                imported_sync_id=book.sync_id
            SharedContentImport.objects.create(
                invitation=invite,recipient=request.user,
                kind=invite.kind,imported_sync_id=imported_sync_id,
            )
        return Response({
            "kind":invite.kind,
            "sync_id":str(imported_sync_id),
            "already_imported":False,
        },status=status.HTTP_201_CREATED)
    except Exception as exc:
        # The DB transaction has rolled back. Storage is not transactional,
        # so remove any successfully uploaded objects as compensation even
        # after an unexpected database error.
        for path in uploaded:
            try:
                delete_object(path)
            except Exception:
                pass
        if not isinstance(exc,(StorageConfigurationError,ValueError,RuntimeError)):
            raise
        return Response(
            {"detail":"Не удалось перенести фотографии. "
                      "Проверьте доступность файлов и повторите импорт. "
                      "Если отправитель удалил фотографии, попросите новую ссылку."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_shared_invitation(request, token):
    """Only the sender may revoke, even with a valid token."""
    invite = SharedContentInvitation.objects.filter(
        token_hash=_hash(token),
        owner=request.user,
    ).first() if isinstance(token, str) and len(token) == 43 else None
    if not invite:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not invite.revoked_at:
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
    return Response(status=status.HTTP_204_NO_CONTENT)
