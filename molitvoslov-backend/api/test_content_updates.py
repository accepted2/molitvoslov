from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .content_update_models import OfflineContentChange
from .content_updates import OfflineContentUpdatesView


class OfflineContentChangeFeedTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = OfflineContentUpdatesView.as_view()

    def test_empty_feed_does_not_require_any_content_tables(self):
        response = self.view(self.factory.get("/api/content-updates/?since=0"))
        self.assertEqual(response.status_code, 200)
        import json
        payload = json.loads(response.content)
        self.assertEqual(payload["changes"], [])
        self.assertEqual(payload["latest_revision"], 0)

    def test_feed_returns_only_changes_after_cursor(self):
        first = OfflineContentChange.objects.create(
            section="public", object_key="texts/first", operation="upsert",
            payload={"title": "First"},
        )
        second = OfflineContentChange.objects.create(
            section="calendar", object_key="2027-01-01/ru", operation="upsert",
            payload={"date_gregorian": "2027-01-01"},
        )
        import json
        payload = json.loads(self.view(
            self.factory.get("/api/content-updates/", {"since": first.pk})
        ).content)
        self.assertEqual([event["id"] for event in payload["changes"]], [second.pk])
        self.assertEqual(payload["cursor"], second.pk)
        self.assertFalse(payload["has_more"])

    def test_pagination_and_invalid_cursors(self):
        OfflineContentChange.objects.bulk_create([
            OfflineContentChange(section="public", object_key=f"texts/{i}", operation="upsert", payload={"id": i})
            for i in range(101)
        ])
        import json
        page1 = json.loads(self.view(self.factory.get("/api/content-updates/?since=0")).content)
        self.assertEqual(len(page1["changes"]), 100)
        self.assertTrue(page1["has_more"])
        page2 = json.loads(self.view(
            self.factory.get("/api/content-updates/", {"since": page1["cursor"]})
        ).content)
        self.assertEqual(len(page2["changes"]), 1)
        self.assertFalse(page2["has_more"])
        self.assertEqual(self.view(self.factory.get("/api/content-updates/?since=-1")).status_code, 400)
        self.assertEqual(self.view(self.factory.get("/api/content-updates/?since=abc")).status_code, 400)
        # A cursor from a reset/replaced database must not look up-to-date.
        self.assertEqual(self.view(self.factory.get("/api/content-updates/?since=999999")).status_code, 409)


class DeltaPatchSerializationTests(TestCase):
    def test_single_verse_fix_uses_narrow_patch(self):
        from .management.commands.publish_offline_content_updates import field_changes, delivery_payload
        from .content_update_models import OfflineContentSnapshot
        before = {"number": 3, "verses": [{"number": i, "text": "unchanged text " * 20} for i in range(1, 31)]}
        after = {"number": 3, "verses": [dict(verse) for verse in before["verses"]]}
        after["verses"][0]["text"] = "fixed"
        operations = field_changes(before, after)
        self.assertEqual(operations, [{"op": "set", "path": ["verses", 0, "text"], "value": "fixed"}])
        old = OfflineContentSnapshot(section="bible", object_key="rst/chapter/JHN/3", checksum="previous", payload=before)
        delivery = delivery_payload(old, after, "new")
        self.assertEqual(delivery["kind"], "patch")
        self.assertEqual(delivery["operations"], operations)

    def test_deleted_field_generates_remove(self):
        from .management.commands.publish_offline_content_updates import field_changes
        self.assertEqual(field_changes({"title": "prayer", "draft": True}, {"title": "prayer"}),
                         [{"op": "remove", "path": ["draft"]}])

    def test_added_akathist_does_not_require_empty_placeholder(self):
        from .management.commands.publish_offline_content_updates import field_changes
        self.assertEqual(field_changes(None, {"slug": "new-akathist", "sections": []}),
                         [{"op": "set", "path": [], "value": {"slug": "new-akathist", "sections": []}}])


class PublicationScopeTests(TestCase):
    def test_partial_year_publication_preserves_other_years(self):
        from unittest.mock import patch
        from django.core.management import call_command
        from .content_update_models import OfflineContentSnapshot

        OfflineContentSnapshot.objects.create(
            section="calendar", object_key="2025-01-01/ru",
            checksum="old2025", payload={"date_gregorian": "2025-01-01"}
        )
        OfflineContentSnapshot.objects.create(
            section="calendar", object_key="2026-01-01/ru",
            checksum="old2026", payload={"date_gregorian": "2026-01-01"}
        )
        with patch(
            "api.management.commands.publish_offline_content_updates.published_objects",
            return_value=iter([("calendar", "2026-01-01/ru", {"date_gregorian": "2026-01-01"})])
        ):
            call_command("publish_offline_content_updates", years=[2026])
        self.assertTrue(OfflineContentSnapshot.objects.filter(object_key="2025-01-01/ru").exists())
        self.assertTrue(OfflineContentSnapshot.objects.filter(object_key="2026-01-01/ru").exists())
