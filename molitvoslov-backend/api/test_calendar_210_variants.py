"""Regression checks for persistent separate hymns, safe importer and API output."""
from django.test import SimpleTestCase

from api.calendar_models import CalendarFeast
from api.calendar_import import _localized_assignments, _assign_imported_value
from api.calendar_serializers import CalendarFeastSerializer


class CalendarHymnVariants210Tests(SimpleTestCase):
    def test_all_alt_fields_exist_in_database_model(self):
        for kind in ("troparion", "kontakion"):
            for suffix in ("", "_uk"):
                for field in ("alt_title", "alt_content"):
                    CalendarFeast._meta.get_field(f"{kind}_{field}{suffix}")

    def test_import_splits_source_without_losing_original_stanza(self):
        assignments = _localized_assignments({
            "title": "Святитель Николай",
            "troparion_content": "Первый тропарь\nИной тропарь\nВторой тропарь",
            "kontakion_content": "Первый кондак\nИной кондак\nВторой кондак",
        }, "ru")
        self.assertEqual(assignments["troparion_content"], "Первый тропарь")
        self.assertEqual(assignments["troparion_alt_content"], "Второй тропарь")
        self.assertEqual(assignments["kontakion_content"], "Первый кондак")
        self.assertEqual(assignments["kontakion_alt_content"], "Второй кондак")

    def test_existing_manual_correction_always_wins(self):
        feat = CalendarFeast(
            title="Святитель Николай",
            troparion_alt_content="Ручная редакция",
            manually_edited_fields=["troparion_alt_content"],
        )
        updated = _assign_imported_value(
            feat, "troparion_alt_content",
            "Некорректный импорт", overwrite_existing=True,
        )
        self.assertFalse(updated)
        self.assertEqual(feat.troparion_alt_content, "Ручная редакция")

    def test_api_returns_two_distinct_hymn_variants_and_ru_title(self):
        feast = CalendarFeast(
            title="Святитель Николай",
            troparion_content="Первый тропарь",
            troparion_alt_content="Иной тропарь",
            kontakion_content="Первый кондак",
            kontakion_alt_content="Иной кондак",
        )
        payload = CalendarFeastSerializer(feast).data
        self.assertEqual(payload["title_ru"], "Святитель Николай")
        self.assertEqual(len(payload["hymns"]), 4)
        self.assertEqual([h["variant"] for h in payload["hymns"]], [1, 2, 1, 2])
        self.assertEqual(payload["troparion_alt_content"], "Иной тропарь")
