import hashlib
import json

from django.http import HttpResponse, HttpResponseNotModified
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from .akathist_curated import is_curated_akathist
from .models import (
    Akathist,
    Canon,
    Category,
    CategoryText,
    DailyQuote,
    Kathisma,
    PrayerRule,
    Psalter,
    Text,
)
from .serializers import (
    AkathistSerializer,
    AkathistSummarySerializer,
    CanonSerializer,
    CanonSummarySerializer,
    CategorySerializer,
    CategoryTextSerializer,
    DailyQuoteSerializer,
    KathismaSerializer,
    PrayerRuleSerializer,
    PsalterSerializer,
    TextSerializer,
)


def build_mobile_content_payload():
    categories_qs = Category.objects.all().order_by("order", "id")
    categories = CategorySerializer(categories_qs, many=True).data

    category_texts = {}
    for category in categories_qs:
        rows = (
            CategoryText.objects.filter(category=category)
            .select_related("category", "text")
            .prefetch_related("text__categories")
            .order_by("order", "id")
        )
        category_texts[category.slug] = CategoryTextSerializer(rows, many=True).data

    texts_qs = Text.objects.filter(is_visible=True).prefetch_related("categories").order_by("id")
    texts = {item["slug"]: item for item in TextSerializer(texts_qs, many=True).data}

    prayer_rules_qs = (
        PrayerRule.objects.filter(is_visible=True)
        .prefetch_related(
            "items__text__categories",
            "items__footnotes",
            "footnotes",
        )
        .order_by("id")
    )
    prayer_rule_list = PrayerRuleSerializer(prayer_rules_qs, many=True).data
    prayer_rules = {
        "list": prayer_rule_list,
        "by_slug": {item["slug"]: item for item in prayer_rule_list},
    }

    psalters_qs = (
        Psalter.objects.filter(is_visible=True)
        .prefetch_related("kathismas__psalms")
        .order_by("id")
    )
    psalter_list = PsalterSerializer(psalters_qs, many=True).data
    psalters = {
        "list": psalter_list,
        "by_slug": {item["slug"]: item for item in psalter_list},
    }

    kathismas_qs = (
        Kathisma.objects.select_related("psalter")
        .prefetch_related(
            "psalms__verses",
            "glories__after_psalm",
            "glories__after_verse",
        )
        .order_by("number", "id")
    )
    kathisma_list = KathismaSerializer(kathismas_qs, many=True).data
    kathismas = {
        "by_number": {str(item["number"]): item for item in kathisma_list},
    }

    visible_akathists = list(Akathist.objects.filter(is_visible=True).order_by("id"))
    curated_akathist_ids = [
        item.id for item in visible_akathists if is_curated_akathist(item)
    ]

    akathists_qs = Akathist.objects.filter(id__in=curated_akathist_ids).order_by("id")
    akathist_list = AkathistSummarySerializer(akathists_qs, many=True).data
    akathist_details = AkathistSerializer(
        akathists_qs.select_related("troparion", "kontakion_before").prefetch_related(
            "sections__text__categories"
        ),
        many=True,
    ).data
    akathists = {
        "list": akathist_list,
        "by_slug": {item["slug"]: item for item in akathist_details},
    }

    canons_qs = Canon.objects.filter(is_visible=True).order_by("id")
    canon_list = CanonSummarySerializer(canons_qs, many=True).data
    canon_details = CanonSerializer(
        canons_qs.prefetch_related("sections__text__categories"),
        many=True,
    ).data
    canons = {
        "list": canon_list,
        "by_slug": {item["slug"]: item for item in canon_details},
    }

    daily_quotes = DailyQuoteSerializer(
        DailyQuote.objects.filter(is_active=True).order_by("order", "id"),
        many=True,
    ).data

    content = {
        "categories": categories,
        "category_texts": category_texts,
        "texts": texts,
        "prayer_rules": prayer_rules,
        "psalters": psalters,
        "kathismas": kathismas,
        "akathists": akathists,
        "canons": canons,
        "daily_quotes": daily_quotes,
    }

    version_source = json.dumps(
        content,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    content_version = hashlib.sha256(version_source).hexdigest()

    return {
        "schema_version": 1,
        "content_version": content_version,
        "generated_at": timezone.now().isoformat(),
        **content,
    }


class MobileContentView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        payload = build_mobile_content_payload()
        content_version = payload["content_version"]
        etag = f'"{content_version}"'

        if request.headers.get("If-None-Match") == etag:
            response = HttpResponseNotModified()
        else:
            body = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            response = HttpResponse(
                body,
                content_type="application/json; charset=utf-8",
            )

        response["ETag"] = etag
        response["Cache-Control"] = "no-cache"
        return response
