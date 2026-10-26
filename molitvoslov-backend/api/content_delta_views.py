from django.db.models import Max
from django.http import JsonResponse
from django.views import View

from .content_delta_models import PublishedContentChange


class ContentRevisionView(View):
    """Single indexed query; never serializes the public content or Bible."""
    def get(self, request):
        latest = PublishedContentChange.objects.aggregate(revision=Max("id"))["revision"] or 0
        response = JsonResponse({"revision": latest, "schema_version": 1})
        response["Cache-Control"] = "public, max-age=60"
        return response


class ContentChangesView(View):
    """Bounded change feed. Client advances cursor only after successful local commit."""
    def get(self, request):
        try:
            after = max(0, int(request.GET.get("after", "0")))
            limit = min(100, max(1, int(request.GET.get("limit", "50"))))
        except (ValueError, TypeError):
            return JsonResponse({"detail": "Некорректный курсор."}, status=400)
        rows = list(PublishedContentChange.objects.filter(id__gt=after).order_by("id")[:limit + 1])
        has_more = len(rows) > limit
        changes = rows[:limit]
        response = JsonResponse({
            "after": after,
            "cursor": changes[-1].id if changes else after,
            "has_more": has_more,
            "changes": [
                {"revision": row.id, "scope": row.scope, "action": row.action,
                 "path": row.data.get("path") if row.data else [],
                 "value": row.data.get("value") if row.data and row.action == "upsert" else None}
                for row in changes
            ],
        })
        response["Cache-Control"] = "no-store"
        return response
