"""Integration checks against the existing editorial hymn schema (not a second 0047)."""
from django.test import SimpleTestCase

from api.calendar_models import CalendarFeast
from api.calendar_serializers import CalendarFeastSerializer


class UocMergedCardApiTests(SimpleTestCase):
    def test_existing_other_chat_fields_and_script_flags_retained(self):
        for name in (
            "troparion_alternate_content", "kontakion_alternate_content",
            "troparion_alternate_content_uk", "kontakion_alternate_content_uk",
            "troparion_alternate_script", "kontakion_alternate_script",
        ):
            self.assertIsNotNone(CalendarFeast._meta.get_field(name))

    def test_legacy_to_civil_compatibility_output(self):
        card = CalendarFeast(
            title="Святые апостолы Петр и Павел",
            title_uk="Святі апостоли Петро і Павло",
            icon_url="https://example.org/icon.jpg",
            troparion_content="Первый тропарь",
            troparion_script="civil",
            troparion_alternate_content="Иной тропарь",
            troparion_alternate_script="civil",
            kontakion_content="Первый кондак",
            kontakion_script="civil",
            kontakion_alternate_content="Иной кондак",
            kontakion_alternate_script="csl",
            manually_edited_fields=[
                "troparion_alternate_content",
                "icon_url",
            ],
        )
        data = CalendarFeastSerializer(card).data
        self.assertEqual(data["title_ru"], "Святые апостолы Петр и Павел")
        self.assertEqual(data["title_uk"], "Святі апостоли Петро і Павло")
        self.assertTrue(data["icon_is_manual"])
        self.assertIn("troparion_alternate_content", data["protected_hymn_fields"])
        self.assertEqual(
            [(h["kind"], h["variant"]) for h in data["hymns"]],
            [("tropar", 1), ("tropar", 2), ("kondak", 1), ("kondak", 2)],
        )
        self.assertEqual(data["hymns"][-1]["language"], "church")

    def test_no_duplicate_migration_field_from_integration(self):
        self.assertFalse(
            any(name.endswith("_alt_content")
                for name in (field.name for field in CalendarFeast._meta.fields))
        )
