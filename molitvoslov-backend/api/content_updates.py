"""Read-only change feed. A no-change check does not touch content tables."""
from django.db.models import Max
from django.http import JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from .content_update_models import OfflineContentChange, OfflineContentSnapshot


class OfflineContentManifestView(APIView):
    """Read only the small append-only revision index, never content tables."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        latest = OfflineContentChange.objects.aggregate(last=Max("id"))["last"] or 0
        response = JsonResponse({"schema_version": 1, "latest_revision": latest})
        response["Cache-Control"] = "private, no-store"
        return response


class OfflineContentUpdatesView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            since = int(request.query_params.get("since", "0"))
        except (TypeError, ValueError):
            return JsonResponse({"detail": "Invalid since cursor"}, status=400)
        if since < 0:
            return JsonResponse({"detail": "Invalid since cursor"}, status=400)

        latest = OfflineContentChange.objects.aggregate(last=Max("id"))["last"] or 0
        if since > latest:
            return JsonResponse({"detail": "Cursor is ahead of published revisions", "reset_required": True}, status=409)

        # Bounded response: users with very old builds receive incremental pages.
        batch = list(
            OfflineContentChange.objects.filter(id__gt=since)
            .order_by("id")
            .values("id", "section", "object_key", "operation", "payload")[:101]
        )
        has_more = len(batch) > 100
        changes = batch[:100]
        cursor = changes[-1]["id"] if changes else since
        response = JsonResponse({
            "schema_version": 1,
            "latest_revision": latest,
            "cursor": cursor,
            "has_more": has_more,
            "changes": changes,
        }, json_dumps_params={"ensure_ascii": False})
        response["Cache-Control"] = "private, no-store"
        return response



class OfflineContentObjectView(APIView):
    """Fetch exactly one published object when a client's bundled baseline differs."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        section = str(request.query_params.get("section") or "")
        key = str(request.query_params.get("key") or "")
        if section not in {"public", "bible", "calendar"} or not key or len(key) > 200:
            return JsonResponse({"detail": "Invalid published object"}, status=400)
        row = OfflineContentSnapshot.objects.filter(
            section=section, object_key=key
        ).values("checksum", "payload").first()
        if not row:
            return JsonResponse({"detail": "Published object not found"}, status=404)
        response = JsonResponse(
            {"checksum": row["checksum"], "payload": row["payload"]},
            json_dumps_params={"ensure_ascii": False},
        )
        response["Cache-Control"] = "private, no-store"
        return response
