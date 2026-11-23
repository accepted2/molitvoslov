"""Focused regression checks for Django edits of canonical saint cards."""
from types import SimpleNamespace

from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase

from .admin import CalendarFeastAdmin
from .calendar_import import upsert_feast
from .calendar_models import CalendarFeast


class CalendarEditorialCardsTests(TestCase):
    def setUp(self):
        self.feast = CalendarFeast.objects.create(
            source_id=99118844,
            title="Преподобный тестовый",
            title_uk="Преподобний тестовий",
            life_content="Исходное житие",
            life_content_uk="Початкове житіє",
            troparion_content="Старый тропарь",
        )

    def test_admin_records_changed_fields_and_import_cannot_overwrite_them(self):
        self.feast.life_content = "Исправлено вручную"
        self.feast.icon_url = "https://example.org/manual-icon.png"
        form = SimpleNamespace(changed_data=["life_content", "icon_url"])
        admin = CalendarFeastAdmin(CalendarFeast, AdminSite())
        admin.save_model(RequestFactory().post("/admin/"), self.feast, form, True)

        upsert_feast({
            "id": 99118844,
            "title": "Преподобный тестовый",
            "life_content": "Импорт перезаписал",
            "icon": "https://example.org/import-icon.png",
            "troparion_content": "Новый тропарь из источника",
        }, overwrite_existing=True)
        self.feast.refresh_from_db()
        self.assertEqual(self.feast.life_content, "Исправлено вручную")
        self.assertEqual(self.feast.icon_url, "https://example.org/manual-icon.png")
        self.assertIn("life_content", self.feast.manually_edited_fields)
        self.assertIn("icon_url", self.feast.manually_edited_fields)
        self.assertEqual(self.feast.troparion_content, "Новый тропарь из источника")

    def test_intentionally_empty_manual_field_stays_empty_after_import(self):
        self.feast.life_content = ""
        self.feast.manually_edited_fields = ["life_content"]
        self.feast.save()
        upsert_feast({
            "id": 99118844,
            "title": "Преподобный тестовый",
            "life_content": "Should not refill",
        }, overwrite_existing=True)
        self.feast.refresh_from_db()
        self.assertEqual(self.feast.life_content, "")

    def test_one_card_endpoint_returns_ukrainian_and_missing_translation_metadata(self):
        self.feast.prayer_content = "Русская молитва"
        self.feast.life_content_uk = "Українське виправлене житіє"
        self.feast.manually_edited_fields = ["life_content_uk"]
        self.feast.save()
        response = self.client.get("/api/calendar/feast/99118844/?lang=uk")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["life_content"], "Українське виправлене житіє")
        self.assertIn("prayer_content", response.data["missing_uk_fields"])
        self.assertEqual(response.data["prayer_content"], "Русская молитва")
        self.assertNotIn("manually_edited_fields", response.data)

    def test_unknown_card_returns_404(self):
        response = self.client.get("/api/calendar/feast/99118845/?lang=ru")
        self.assertEqual(response.status_code, 404)
