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
