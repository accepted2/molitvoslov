import hashlib
import json

from django.http import HttpResponse, HttpResponseNotModified
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from .models import BibleBook, BibleChapter, BibleTranslation, BibleVerse


def build_bible_content_payload(translation_code="rst"):
    translation = (
        BibleTranslation.objects.filter(
            code=translation_code,
            is_visible=True,
        )
        .first()
    )

    if translation is None:
        return None

    verses = BibleVerse.objects.all().order_by("number", "id")
    chapters = (
        BibleChapter.objects.all()
        .order_by("number", "id")
        .prefetch_related("verses")
    )
    books = (
        BibleBook.objects.filter(translation=translation)
        .order_by("canonical_order", "id")
        .prefetch_related("chapters__verses")
    )

    data = {
        "schema_version": 1,
        "translation": {
            "id": translation.id,
            "code": translation.code,
            "name": translation.name,
            "language": translation.language,
            "script_variant": translation.script_variant,
            "source_url": translation.source_url,
            "source_revision": translation.source_revision,
            "license": translation.license_name,
        },
        "books": [],
    }

    for book in books:
        book_data = {
            "id": book.id,
            "code": book.code,
            "testament": book.testament,
            "section": book.section,
            "name": book.name,
            "short_name": book.short_name,
            "slug": book.slug,
            "canonical_order": book.canonical_order,
            "is_appendix": book.is_appendix,
            "chapters": [],
        }

        for chapter in book.chapters.all():
            chapter_data = {
                "id": chapter.id,
                "number": chapter.number,
                "verses": [],
            }

            for verse in chapter.verses.all():
                chapter_data["verses"].append(
                    {
                        "id": verse.id,
                        "number": verse.number,
                        "text": verse.text,
                    }
                )

            book_data["chapters"].append(chapter_data)

        data["books"].append(book_data)

    version_source = json.dumps(
        data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return {
        **data,
        "content_version": hashlib.sha256(version_source).hexdigest(),
        "generated_at": timezone.now().isoformat(),
    }


class BibleContentView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        translation_code = str(request.query_params.get("translation") or "rst").strip()

        payload = build_bible_content_payload(translation_code)

        if payload is None:
            return HttpResponse(
                json.dumps(
                    {"detail": "Перевод Библии не найден."},
                    ensure_ascii=False,
                ),
                status=404,
                content_type="application/json; charset=utf-8",
            )

        content_version = payload["content_version"]
        etag = f'"{content_version}"'

        if request.headers.get("If-None-Match") == etag:
            response = HttpResponseNotModified()
        else:
            response = HttpResponse(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                content_type="application/json; charset=utf-8",
            )

        response["ETag"] = etag
        response["Cache-Control"] = "no-cache"
        return response
