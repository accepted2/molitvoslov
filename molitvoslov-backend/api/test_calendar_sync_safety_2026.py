"""Tests for the safe 2026 -> Supabase calendar migration and July 24 fix."""
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.repair_calendar_readings_2026_july24 import (
    APPOINTMENTS, first_reference_key, plan_july24_repair,
)
from api.management.commands.sync_calendar_to_supabase import Command


def row(pk, kind, label, title, order=10, sync_uid=None):
    return SimpleNamespace(
        pk=pk, kind=kind, label=label, title=title,
        order=order, sync_uid=sync_uid or f"uid-{pk}",
    )


class CalendarRemoteReadingMatchingTests(SimpleTestCase):
    def _find(self, remote, local, excluded=None):
        mocked = MagicMock()
        mocked.using.return_value.filter.return_value = remote
        with patch(
            "api.management.commands.sync_calendar_to_supabase.CalendarReading.objects",
            mocked,
        ):
            return Command()._find_remote_reading(
                object(), local, excluded,
            )

    def test_same_june_5_apostle_with_different_zachalo_format(self):
        remote = row(12, "apostle", "", "Рим.2:14–29")
        local = row(5, "apostle", "", "Рим.2:14–29 (зач. 82)")
        self.assertIs(self._find([remote], local), remote)

    def test_same_june_5_gospel_even_if_spaces_and_dashes_differ(self):
        remote = row(12, "gospel", "", "Мф. 5:33-41")
        local = row(5, "gospel", "", "Мф.5:33–41 (зач. 14)")
        self.assertIs(self._find([remote], local), remote)

    def test_same_june_26_readings_are_not_eligible_for_delete(self):
        remote = [
            row(11, "apostle", "", "Рим.11:25–36"),
            row(12, "gospel", "", "Мф.12:1–8"),
        ]
        local = [
            row(21, "apostle", "", "Рим.11:25–36 (зач. 107)"),
            row(22, "gospel", "", "Мф.12:1–8 (зач. 44)"),
        ]
        used = set()
        for item in local:
            found = self._find(remote, item, used)
            self.assertIsNotNone(found)
            used.add(found.pk)
        self.assertEqual(used, {11, 12})

    def test_does_not_reuse_remote_row_for_two_local_entries(self):
        remote = row(11, "gospel", "", "Ин.1:1–17")
        local = row(22, "gospel", "", "Ин.1:1–17 (зач. 1)")
        self.assertIsNone(self._find([remote], local, {11}))

    def test_does_not_match_different_scripture(self):
        remote = row(11, "gospel", "", "Ин.1:1–17")
        local = row(22, "gospel", "", "Ин.1:18–28")
        self.assertIsNone(self._find([remote], local))

    def test_mass_feast_create_needs_explicit_confirmation(self):
        with self.assertRaises(CommandError):
            Command()._guard_mass_feast_create(
                {"feast_create": ["Feast"] * 2752},
                {"apply": True, "confirm_mass_feast_create": False},
            )

    def test_mass_feast_create_allows_dry_run_and_confirmed_apply(self):
        options = {"apply": False, "confirm_mass_feast_create": False}
        Command()._guard_mass_feast_create(
            {"feast_create": ["Feast"] * 2752}, options,
        )
        options = {"apply": True, "confirm_mass_feast_create": True}
        Command()._guard_mass_feast_create(
            {"feast_create": ["Feast"] * 2752}, options,
        )

    def test_small_feast_sync_does_not_require_mass_confirmation(self):
        Command()._guard_mass_feast_create(
            {"feast_create": ["Feast"] * 100},
            {"apply": True, "confirm_mass_feast_create": False},
        )

    def test_prevents_unapproved_remote_deletion(self):
        with self.assertRaises(CommandError):
            Command()._guard_reading_deletions(
                {"reading_delete": ["2026-06-05 Рим.2:14–29"]},
                {"apply": True, "allow_reading_deletes": False},
            )

    def test_allows_remote_deletion_only_with_explicit_flag(self):
        Command()._guard_reading_deletions(
            {"reading_delete": ["2026-06-05 Рим.2:14–29"]},
            {"apply": True, "allow_reading_deletes": True},
        )

    def test_dry_run_still_lists_remote_deletions_without_writing(self):
        Command()._guard_reading_deletions(
            {"reading_delete": ["2026-06-05 Рим.2:14–29"]},
            {"apply": False, "allow_reading_deletes": False},
        )


class July24CalendarRepairTests(SimpleTestCase):
    def _historic_rows(self):
        return [
            row(1, "apostle", "чтения дня и равноапостольной",
                "Деян.16:12–15 (последи́ 37 зач.)", 10),
            row(2, "apostle",
                ': «Во дни оны, бысть идущим апостолом в Филиппу́сы...», преступи в 39 зач., 17:1–4, конец',
                "2Кор.6:1–10 (181 зач.)", 20),
            row(3, "gospel", "", "Мф.25:1–13 (104 зач.)", 30),
            row(4, "gospel", "", "Мф.13:33", 40),
            row(5, "gospel",
                ': «Во дни оны, бысть идущим апостолом в Филиппу́сы...», преступи в 39 зач., 17:1–4, конец',
                "Лк.7:36–50 (33 зач.)", 50),
        ]

    def test_original_five_rows_get_cleaned_and_missing_five_inserted(self):
        actions, unexpected = plan_july24_repair(self._historic_rows())
        self.assertEqual(unexpected, [])
        self.assertEqual(sum(x["action"] == "CREATE" for x in actions), 5)
        self.assertEqual(sum(x["action"] == "UPDATE" for x in actions), 5)
        self.assertEqual(len(actions), 10)
        titles = [x["after"]["title"] for x in actions]
        self.assertIn("1Кор.11:8–22 (зач. 148)", titles)
        self.assertIn("Мф.17:10–18 (зач. 71)", titles)
        self.assertIn("Деян.16:12–15,17:1–4", titles)
        self.assertIn("Мф.13:33,44–50", titles)
        self.assertTrue(all(len(x["after"]["label"]) <= 255 for x in actions))

    def test_corrected_day_is_idempotent(self):
        rows = [
            row(i, kind, label, title, i * 10)
            for i, (kind, label, title, _aliases) in enumerate(APPOINTMENTS, 1)
        ]
        actions, unexpected = plan_july24_repair(rows)
        self.assertFalse(unexpected)
        self.assertTrue(all(x["action"] == "SAME" for x in actions))

    def test_nonmatching_local_rows_are_never_deleted(self):
        original = self._historic_rows()
        original.append(row(99, "gospel", "Ручное чтение", "Мк.1:1–8", 95))
        actions, unexpected = plan_july24_repair(original)
        self.assertEqual([x["id"] for x in unexpected], [99])
        self.assertEqual(len(actions), 10)

    def test_ambiguous_legacy_rows_force_manual_review(self):
        original = self._historic_rows()
        original.append(row(98, "gospel", "", "Мф.25:1–13", 50))
        with self.assertRaises(CommandError):
            plan_july24_repair(original)

    def test_first_reference_ignores_old_zachalo_annotation(self):
        self.assertEqual(
            first_reference_key("Деян.16:12–15 (последи́ 37 зач.)"),
            first_reference_key("Деян.16:12–15"),
        )
