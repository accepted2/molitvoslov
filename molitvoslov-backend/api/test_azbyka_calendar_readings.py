from datetime import date

from django.test import SimpleTestCase

from api.azbyka_calendar_readings import (
    ParsedReading,
    extract_readings_text,
    parse_readings_text,
)
from api.management.commands.import_azbyka_calendar_readings import (
    deterministic_azbyka_reading_uid,
)


class AzbykaCalendarReadingsParserTests(SimpleTestCase):
    def test_parses_complex_sunday_groups(self):
        source = (
            "Утр. – Ин.20:1–10 (зач. 63). "
            "Лит. – Недели по Воздвижении: Гал.2:16–20 (зач. 203). "
            "Мк.8:34–9:1 (зач. 37). "
            "Ряд.: 2Кор.9:6-11 (зач. 188). "
            "Мф.18:23–35 (зач. 77). "
            "Свт.: Евр.7:26–8:2 (зач. 318). "
            "Ин.10:9–16 (зач. 36)."
        )

        readings = parse_readings_text(source)

        self.assertEqual(len(readings), 7)
        self.assertEqual(
            [(item.kind, item.label) for item in readings],
            [
                ("gospel", "Утр."),
                ("apostle", "Недели по Воздвижении"),
                ("gospel", "Недели по Воздвижении"),
                ("apostle", "Ряд."),
                ("gospel", "Ряд."),
                ("apostle", "Свт."),
                ("gospel", "Свт."),
            ],
        )
        self.assertEqual(readings[3].title, "2Кор.9:6–11 (зач. 188)")

    def test_parses_saturday_labels(self):
        source = (
            "Субботы по Воздвижении: 1Кор.1:26-29 (зач. 125 от полу́). "
            "Ин.8:21–30 (зач. 30). "
            "Ряд. (под зачало): 1Кор.15:39-45 (зач. 162). "
            "Мф.19:3–12 (зач. 78). "
            "Вмч. или свв.: Еф.6:10–17 (зач. 233). "
            "Лк.21:12–19 (зач. 106)."
        )

        readings = parse_readings_text(source)

        self.assertEqual(len(readings), 6)
        self.assertEqual(readings[0].label, "Субботы по Воздвижении")
        self.assertEqual(readings[1].label, "Субботы по Воздвижении")
        self.assertEqual(readings[2].label, "Ряд. (под зачало)")
        self.assertEqual(readings[3].label, "Ряд. (под зачало)")
        self.assertEqual(readings[4].label, "Вмч. или свв.")
        self.assertEqual(readings[5].label, "Вмч. или свв.")

    def test_parses_unlabelled_pair_then_saint_pair(self):
        source = (
            "Флп.1:1–7 (зач. 235). "
            "Лк.3:19–22 (зач. 10). "
            "Сщмч.: Евр.4:14–5:6 (зач. 311). "
            "Ин.10:9–16 (зач. 36)."
        )

        readings = parse_readings_text(source)

        self.assertEqual(len(readings), 4)
        self.assertEqual(
            [item.label for item in readings],
            ["", "", "Сщмч.", "Сщмч."],
        )

    def test_normalizes_spaces_around_abbreviations(self):
        source = (
            "Флп.1:1–7 ( зач. 235). "
            "Лк.3:19–22 ( зач. 10). "
            "Сщмч .: Евр.4:14–5:6 (зач. 311). "
            "Ин.10:9–16 (зач. 36)."
        )

        readings = parse_readings_text(source)

        self.assertEqual(readings[0].title, "Флп.1:1–7 (зач. 235)")
        self.assertEqual(readings[1].title, "Лк.3:19–22 (зач. 10)")
        self.assertEqual(readings[2].label, "Сщмч.")
        self.assertEqual(readings[3].label, "Сщмч.")

    def test_preserves_comma_separated_chapter_verses_and_following_labels(self):
        source = (
            "3Ин.1:1–15 (зач. 76). "
            "Лк.19:29–40,22:7–39 (зач. 96). "
            "Прав.: Евр.9:11–14 (зач. 321). Лк.2:25–38 (зач. 8). "
            "Богородицы: Лк.10:38–42,11:27–28 (зач. 54). "
            "Или свт.: Евр.13:17–21 (зач. 335)."
        )
        readings = parse_readings_text(source)
        self.assertEqual(len(readings), 6)
        self.assertEqual(readings[1].title, "Лк.19:29–40,22:7–39 (зач. 96)")
        self.assertEqual(readings[2].label, "Прав.")
        self.assertEqual(readings[4].title, "Лк.10:38–42,11:27–28 (зач. 54)")
        self.assertEqual(readings[5].label, "Или свт.")

    def test_lenten_sixth_hour_and_vespers_keep_service_labels(self):
        source = "На 6-м часе: Ис.5:7–16. " "На веч.: Быт.4:8–15. Притч.5:1–15."

        readings = parse_readings_text(source)

        self.assertEqual(
            [(item.kind, item.label, item.title) for item in readings],
            [
                ("old_testament", "На 6-м часе", "Ис.5:7–16"),
                ("old_testament", "На веч.", "Быт.4:8–15"),
                ("old_testament", "На веч.", "Притч.5:1–15"),
            ],
        )

    def test_2027_pascha_readings_include_vespers_service(self):
        readings = parse_readings_text(
            "Рядовое: Лит. – Ап.: Деян.1:1-8 . "
            "Ев.: Ин.1:1-17 . Веч. – Ин.20:19-25 ."
        )
        self.assertEqual(
            [(r.kind, r.label) for r in readings],
            [("apostle", "Ряд."), ("gospel", "Ряд."), ("gospel", "Веч.")],
        )
        self.assertEqual(readings[2].title, "Ин.20:19–25")

    def test_2027_january_liturgy_colum_labels_not_rubrics(self):
        readings = parse_readings_text(
            "Рядовое: Лит. – Ап.: Евр.11:8,11-16 . Ев.: Мк.9:33-41 ."
        )
        self.assertEqual([r.label for r in readings], ["Ряд.", "Ряд."])

    def test_same_passage_is_not_twice_in_same_service(self):
        readings = parse_readings_text(
            "Ряд.: Деян.1:1–8 (зач. 1). Ин.1:1–17 (зач. 1). "
            "Свт.: Деян. 1:1-8 (зач. 1). Ин. 1:1-17 (зач. 1)."
        )
        self.assertEqual(len(readings), 2)

    def test_same_passage_is_allowed_in_separate_services(self):
        readings = parse_readings_text(
            "Утр. – Ин.20:1–10 (зач. 63). "
            "Веч. – Ин.20:1–10 (зач. 63)."
        )
        self.assertEqual(len(readings), 2)
        self.assertNotEqual(readings[0].label, readings[1].label)


    def test_2027_january_16_all_six_readings_from_three_paragraphs(self):
        html = """
        <html><body>
          <h2>Чтения <a>Священного Писания</a></h2>
          <p>Субботы: Лит. – Ап.: 1Тим.3:14-4:5. Ев.: Мф.3:1-11.</p>
          <p>Мч.: Лит. – Ап.: 2Тим.2:1-10. Ев.: Мф.10:16-22.</p>
          <p>Рядовое: Лит. – Ап.: 1Сол.5:14-23. Ев.: Лк.17:3-10.</p>
          <ul><li>Богослужебные чтения дня</li></ul>
          <h2>Богослужения</h2>
          <p>Пояснение: Ин.1:1-17.</p>
        </body></html>
        """
        extracted = extract_readings_text(html)
        readings = parse_readings_text(extracted)
        self.assertEqual(
            [(r.kind, r.label, r.title) for r in readings],
            [
                ("apostle", "Субботы", "1Тим.3:14–4:5"),
                ("gospel", "Субботы", "Мф.3:1–11"),
                ("apostle", "Мч.", "2Тим.2:1–10"),
                ("gospel", "Мч.", "Мф.10:16–22"),
                ("apostle", "Ряд.", "1Сол.5:14–23"),
                ("gospel", "Ряд.", "Лк.17:3–10"),
            ],
        )
        self.assertEqual([r.order for r in readings], [10, 20, 30, 40, 50, 60])

    def test_2027_january_16_merge_adds_four_missing_readings(self):
        from api.calendar_reading_identity import readings_to_add
        html = """
        <h2>Чтения Священного Писания</h2>
        <p>Субботы: Лит. – Ап.: 1Тим.3:14-4:5. Ев.: Мф.3:1-11.</p>
        <p>Мч.: Лит. – Ап.: 2Тим.2:1-10. Ев.: Мф.10:16-22.</p>
        <p>Рядовое: Лит. – Ап.: 1Сол.5:14-23. Ев.: Лк.17:3-10.</p>
        <h2>Богослужения</h2>
        """
        six = parse_readings_text(extract_readings_text(html))
        self.assertEqual(len(six), 6)
        self.assertEqual(readings_to_add(six[:2], six), six[2:])
        self.assertEqual(readings_to_add(six, six), [])

    def test_day_readings_in_list_items_not_doubled_by_nested_paragraphs(self):
        html = """
        <h2>Чтения Священного Писания</h2>
        <ul>
          <li><p>Субботы: 1Тим.3:14-4:5. Мф.3:1-11.</p></li>
          <li><p>Мч.: 2Тим.2:1-10. Мф.10:16-22.</p></li>
        </ul>
        <h2>Богослужения</h2>
        """
        readings = parse_readings_text(extract_readings_text(html))
        self.assertEqual(len(readings), 4)
        self.assertEqual([r.label for r in readings], ["Субботы", "Субботы", "Мч.", "Мч."])

    def test_explanatory_prose_after_readings_is_not_read_as_daily_service(self):
        html = """
        <h2>Чтения Священного Писания</h2>
        <p>Субботы: 1Тим.3:14-4:5. Мф.3:1-11.</p>
        <p>Если служба полиелейная, читается Ин.10:9-16.</p>
        <h2>Богослужения</h2>
        """
        readings = parse_readings_text(extract_readings_text(html))
        self.assertEqual(len(readings), 2)
        self.assertFalse(any("Ин.10:9" in r.title for r in readings))

    def test_first_paragraph_navigation_does_not_truncate_readings(self):
        html = """
        <h2>Чтения Священного Писания</h2>
        <p>Богослужебные чтения дня</p>
        <p>Субботы: 1Тим.3:14-4:5. Мф.3:1-11.</p>
        <p>Мч.: 2Тим.2:1-10. Мф.10:16-22.</p>
        <h2>Богослужения</h2>
        """
        readings = parse_readings_text(extract_readings_text(html))
        self.assertEqual(len(readings), 4)

    def test_extracts_first_reading_paragraph_only(self):
        html = """
        <html><body>
          <h2>Чтения <a>Священного Писания</a></h2>
          <p>Флп.1:1–7 (зач. 235). Лк.3:19–22 (зач. 10).</p>
          <p>Если служба полиелейная, читается Ин.10:9–16 (зач. 36).</p>
          <h2>Богослужения</h2>
        </body></html>
        """

        text = extract_readings_text(html)

        self.assertIn("Флп.1:1", text)
        self.assertNotIn("Ин.10:9", text)


class AzbykaCalendarReadingSyncUidTests(SimpleTestCase):
    def test_sync_uid_is_stable_for_same_reading(self):
        reading = ParsedReading(
            kind="apostle",
            label="Сщмч.",
            title="Евр.4:14–5:6 (зач. 311)",
            order=30,
        )

        first = deterministic_azbyka_reading_uid(date(2026, 10, 5), reading)
        second = deterministic_azbyka_reading_uid(date(2026, 10, 5), reading)

        self.assertEqual(first, second)

    def test_sync_uid_changes_when_reading_identity_changes(self):
        original = ParsedReading(
            kind="gospel",
            label="",
            title="Лк.3:19–22 (зач. 10)",
            order=20,
        )
        changed = ParsedReading(
            kind="gospel",
            label="",
            title="Лк.3:20–22 (зач. 10)",
            order=20,
        )

        original_uid = deterministic_azbyka_reading_uid(
            date(2026, 10, 5),
            original,
        )
        changed_uid = deterministic_azbyka_reading_uid(
            date(2026, 10, 5),
            changed,
        )

        self.assertNotEqual(original_uid, changed_uid)

    def test_sync_uid_changes_for_same_reading_on_another_date(self):
        reading = ParsedReading(
            kind="gospel",
            label="",
            title="Лк.3:19–22 (зач. 10)",
            order=20,
        )

        first_day = deterministic_azbyka_reading_uid(
            date(2026, 10, 5),
            reading,
        )
        second_day = deterministic_azbyka_reading_uid(
            date(2026, 10, 6),
            reading,
        )

        self.assertNotEqual(first_day, second_day)


class CalendarReadingsMergeTests(SimpleTestCase):
    def _reading(self, kind, label, title, order=10):
        return ParsedReading(kind=kind, label=label, title=title, order=order)

    def test_matches_same_biblical_range_different_dashes_and_zachalo(self):
        from api.management.commands.import_azbyka_calendar_readings import readings_to_add
        current = [self._reading("gospel", "Ряд.", "Ин.1:1–17 (зач. 1)")]
        incoming = [self._reading("gospel", "Ряд.", "Ин.1:1-17", 20)]
        self.assertEqual(readings_to_add(current, incoming), [])

    def test_unlabelled_routine_is_same_as_ryad(self):
        from api.management.commands.import_azbyka_calendar_readings import readings_to_add
        previous = [self._reading("gospel", "", "Ин.1:1–17")]
        source = [self._reading("gospel", "Ряд.", "Ин.1:1–17")]
        self.assertEqual(readings_to_add(previous, source), [])

    def test_adds_missing_apostle_without_removing_existing_gospel(self):
        from api.management.commands.import_azbyka_calendar_readings import readings_to_add
        original = self._reading("gospel", "", "Ин.1:1–17")
        missing = self._reading("apostle", "", "Деян.1:1–8", 20)
        self.assertEqual(readings_to_add([original], [original, missing]), [missing])

    def test_keeps_distinct_services(self):
        from api.management.commands.import_azbyka_calendar_readings import readings_to_add
        liturgy = self._reading("gospel", "Лит.", "Ин.1:1–17")
        evening = self._reading("gospel", "Веч.", "Ин.1:1–17")
        self.assertEqual(readings_to_add([liturgy], [evening]), [evening])

    def test_deduplicates_repeated_incoming_rows(self):
        from api.management.commands.import_azbyka_calendar_readings import readings_to_add
        reading = self._reading("gospel", "", "Мк.9:33–41")
        self.assertEqual(readings_to_add([], [reading, reading]), [reading])

    def test_different_boundaries_are_not_treated_as_same_reading(self):
        from api.management.commands.import_azbyka_calendar_readings import readings_to_add
        first = self._reading("gospel", "", "Лк.1:39–49,56")
        second = self._reading("gospel", "", "Лк.1:39–49")
        self.assertEqual(readings_to_add([first], [second]), [second])


class CalendarReadingDeduplicationTests(SimpleTestCase):
    def _row(self, kind, label, title, pk, order):
        from types import SimpleNamespace
        return SimpleNamespace(kind=kind, label=label, title=title, pk=pk, order=order)

    def test_same_gospel_ordinary_vs_no_label_is_not_added(self):
        from api.calendar_reading_identity import readings_to_add
        existing = [self._row("gospel", "", "Ин. 1:1–17 (зач. 1)", 2, 10)]
        incoming = [self._row("gospel", "Ряд.", "Ин.1:1-17 (зач. 1)", 5, 50)]
        self.assertEqual(readings_to_add(existing, incoming), [])

    def test_same_apostle_different_source_labels_is_not_added(self):
        from api.calendar_reading_identity import readings_to_add
        existing = [self._row("apostle", "Ряд.", "Деян.1:1–8", 2, 10)]
        incoming = [self._row("apostle", "Свт.", "Деян. 1:1-8 (зач. 1)", 5, 30)]
        self.assertEqual(readings_to_add(existing, incoming), [])

    def test_two_services_are_distinct(self):
        from api.calendar_reading_identity import normalized_reading_key, readings_to_add
        first = self._row("gospel", "Утр.", "Ин. 1:1–17", 1, 10)
        second = self._row("gospel", "На веч.", "Ин. 1:1–17", 2, 20)
        self.assertNotEqual(normalized_reading_key(first), normalized_reading_key(second))
        self.assertEqual(readings_to_add([first], [second]), [second])

    def test_cleanup_removes_only_equivalent_duplicates(self):
        from api.management.commands.deduplicate_calendar_readings import select_duplicate_cleanup
        a = self._row("gospel", "", "Ин.1:1–17", 10, 10)
        b = self._row("gospel", "Ряд.", "Ин. 1:1-17 (зач. 1)", 11, 20)
        removal, ambiguous = select_duplicate_cleanup([a, b])
        self.assertEqual([(keep.pk, [r.pk for r in extra]) for keep, extra in removal], [(10, [11])])
        self.assertEqual(ambiguous, [])

    def test_cleanup_preserves_different_feast_labels(self):
        from api.management.commands.deduplicate_calendar_readings import select_duplicate_cleanup
        a = self._row("gospel", "Ряд.", "Мф.1:1–8", 10, 10)
        b = self._row("gospel", "Свт.", "Мф.1:1–8", 11, 20)
        removal, ambiguous = select_duplicate_cleanup([a, b])
        self.assertEqual(removal, [])
        self.assertEqual([[r.pk for r in group] for group in ambiguous], [[10, 11]])

    def test_bible_range_boundary_difference_is_not_duplicate(self):
        from api.calendar_reading_identity import normalized_reading_key
        a = self._row("gospel", "", "Лк.1:39–49,56", 1, 10)
        b = self._row("gospel", "", "Лк.1:39–49", 2, 20)
        self.assertNotEqual(normalized_reading_key(a), normalized_reading_key(b))

    def test_coalesces_differently_labeled_same_scripture_and_preserves_reasons(self):
        from api.management.commands.deduplicate_calendar_readings import plan_reading_coalescence
        a = self._row("gospel", "Ряд.", "Ин.1:1–17 (зач. 1)", 10, 10)
        b = self._row("gospel", "Свт.", "Ин. 1:1-17", 11, 20)
        actions, review = plan_reading_coalescence([a, b])
        self.assertEqual(review, [])
        self.assertEqual(len(actions), 1)
        keep, extras, label = actions[0]
        self.assertEqual(keep.pk, 10)
        self.assertEqual([r.pk for r in extras], [11])
        self.assertEqual(label, "Ряд.; Свт.")

    def test_coalesces_apostolic_with_three_distinct_labels(self):
        from api.management.commands.deduplicate_calendar_readings import plan_reading_coalescence
        a = self._row("apostle", "", "Гал.2:16–20", 1, 10)
        b = self._row("apostle", "Ряд.", "Гал.2:16–20", 2, 20)
        c = self._row("apostle", "Свт.", "Гал.2:16-20", 3, 30)
        actions, review = plan_reading_coalescence([a, b, c])
        self.assertEqual(review, [])
        self.assertEqual(len(actions), 1)
        self.assertEqual([r.pk for r in actions[0][1]], [2, 3])
        self.assertEqual(actions[0][2], "Ряд.; Свт.")

    def test_coalescence_does_not_combine_different_services(self):
        from api.management.commands.deduplicate_calendar_readings import plan_reading_coalescence
        a = self._row("gospel", "Утр.", "Ин.20:19–25", 1, 10)
        b = self._row("gospel", "Веч.", "Ин.20:19–25", 2, 20)
        actions, review = plan_reading_coalescence([a, b])
        self.assertEqual(actions, [])
        self.assertEqual(review, [])

    def test_coalescence_rejects_oversized_combined_label(self):
        from api.management.commands.deduplicate_calendar_readings import plan_reading_coalescence
        a = self._row("gospel", "Святой " + "а" * 150, "Ин.1:1-17", 1, 10)
        b = self._row("gospel", "Память " + "б" * 150, "Ин.1:1-17", 2, 20)
        actions, review = plan_reading_coalescence([a, b])
        self.assertEqual(actions, [])
        self.assertEqual(len(review), 1)
        self.assertEqual(review[0][1], "COMBINED_LABEL_TOO_LONG")

    def test_coalescence_is_idempotent_on_clean_rows(self):
        from api.management.commands.deduplicate_calendar_readings import plan_reading_coalescence
        a = self._row("gospel", "Ряд.; Свт.", "Ин.1:1-17", 1, 10)
        actions, review = plan_reading_coalescence([a])
        self.assertEqual(actions, [])
        self.assertEqual(review, [])

    def test_rerunning_merge_is_idempotent(self):
        from api.calendar_reading_identity import readings_to_add
        already = [self._row("apostle", "", "Гал.2:16–20", 1, 10)]
        source = [self._row("apostle", "Ряд.", "Гал.2:16-20", 2, 10)]
        first = readings_to_add(already, source)
        second = readings_to_add(already + first, source)
        self.assertEqual(first, [])
        self.assertEqual(second, [])
