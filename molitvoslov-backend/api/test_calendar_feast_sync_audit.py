"""Pure, offline audit tests: no Supabase credentials required."""
from datetime import date

from django.test import SimpleTestCase

from api.management.commands.audit_calendar_feast_sync import (
    canonical_feast_title,
    find_feast_collision_candidates,
)


def entry(pk, title, *, short="", source_id=None, uid=None):
    return {
        "id": pk, "title": title, "short_title": short,
        "source_id": source_id, "sync_uid": uid,
    }


class CalendarFeastSyncPreflightTests(SimpleTestCase):
    def test_canonical_titles_match_diacritics_and_punctuation(self):
        self.assertEqual(
            canonical_feast_title("Преподобный Евме́ний, епископ Гортинский"),
            canonical_feast_title("преподобный Евмений — епископ Гортинский"),
        )

    def test_uuid_match_does_not_appear_as_create(self):
        stats, same_day, global_only, missing = find_feast_collision_candidates(
            [entry(1, "Прп. Сергия", uid="a-unique-uid")],
            {1: {date(2026, 10, 8)}},
            [entry(50, "Совсем другое название", uid="a-unique-uid")],
            {date(2026, 10, 8): {50}},
        )
        self.assertEqual(stats["already_matched_by_uid"], 1)
        self.assertEqual(stats.get("would_create", 0), 0)
        self.assertEqual((same_day, global_only, missing), ([], [], []))

    def test_source_id_match_does_not_appear_as_create(self):
        stats, *_ = find_feast_collision_candidates(
            [entry(1, "Свт. Николая", source_id=9123)],
            {}, [entry(50, "Святитель Николай", source_id=9123)], {},
        )
        self.assertEqual(stats["already_matched_by_source_id"], 1)
        self.assertEqual(stats.get("would_create", 0), 0)

    def test_same_day_title_collision_is_flagged(self):
        day = date(2026, 12, 19)
        stats, same_day, global_only, missing = find_feast_collision_candidates(
            [entry(1, "Свт. Николая Чудотворца", short="Свт. Николая")],
            {1: {day}},
            [entry(50, "Святителя Николая", short="Свт. Николая")],
            {day: {50}},
        )
        self.assertEqual(stats["would_create"], 1)
        self.assertEqual(stats["same_day_exact_name_risks"], 1)
        self.assertEqual(same_day[0]["possible_matches"][0]["remote_id"], 50)
        self.assertEqual((global_only, missing), ([], []))

    def test_global_only_title_match_kept_separate(self):
        day = date(2026, 1, 1)
        stats, same_day, global_only, missing = find_feast_collision_candidates(
            [entry(1, "Икона Божией Матери А", short="Икона")],
            {1: {day}},
            [entry(50, "Икона Божией Матери Б", short="Икона")],
            {date(2026, 12, 10): {50}},
        )
        self.assertEqual(stats["global_name_matches_review"], 1)
        self.assertEqual((same_day, missing), ([], []))
        self.assertEqual(global_only[0]["local_id"], 1)

    def test_clean_create_has_no_title_collision(self):
        stats, same_day, global_only, missing = find_feast_collision_candidates(
            [entry(1, "Преподобный новый святой", uid="unmatched")],
            {1: {date(2026, 1, 2)}},
            [entry(50, "Другой святой", uid="other")],
            {},
        )
        self.assertEqual(stats["would_create"], 1)
        self.assertEqual(stats["no_name_match"], 1)
        self.assertEqual((same_day, global_only), ([], []))
        self.assertEqual(missing[0]["local_id"], 1)

    def test_same_name_twice_in_local_but_distinct_source_ids_needs_manual_check(self):
        day = date(2026, 12, 10)
        stats, same_day, global_only, missing = find_feast_collision_candidates(
            [entry(1, "Собор Святых", source_id=1),
             entry(2, "Собор Святых", source_id=2)],
            {1: {day}, 2: {day}},
            [entry(50, "Собор Святых", source_id=None)],
            {day: {50}},
        )
        self.assertEqual(stats["same_day_exact_name_risks"], 2)
        self.assertEqual(len(same_day), 2)
