from datetime import date

from rest_framework.test import APITestCase

from api.calendar_import import upsert_day
from api.calendar_models import CalendarDay, CalendarFeast, CalendarReading


class CalendarApiTests(APITestCase):
    def test_day_endpoint_returns_church_site_calendar_data(self):
        feast = CalendarFeast.objects.create(
            source_id=501,
            title="Святитель Николай",
            short_title="Свт. Николая Чудотворца",
            celebration_rank="polyeleos",
            icon_url="https://example.com/nikolai.jpg",
            troparion_content="Тропарь",
            kontakion_content="Кондак",
            life_content="Житие",
        )

        day = CalendarDay.objects.create(
            date_gregorian=date(2026, 9, 30),
            julian_month=9,
            julian_day=17,
            main_feast=feast,
            fast_type_code="fast",
            fast_type_title="Постный день",
            fast_name="",
            gospel_title="Мф. 10:17-22",
            apostolic_title="Евр. 11:33-40",
        )
        day.feasts.add(feast)

        response = self.client.get(
            "/api/calendar/day/",
            {"date": "2026-09-30"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["main_feast"]["source_id"], 501)
        self.assertEqual(response.data["gospel_title"], "Мф. 10:17-22")
        self.assertEqual(len(response.data["all_feasts"]), 1)

    def test_importer_chooses_ranked_main_feast_when_source_has_none(self):
        payload = {
            "date_gregorian": "2026-10-01",
            "julian_month": 9,
            "julian_day": 18,
            "all_feasts": [
                {
                    "id": 601,
                    "title": "Обычная память",
                    "celebration_type": "",
                    "celebration_rank": "ordinary",
                },
                {
                    "id": 602,
                    "title": "Праздник с полиелеем",
                    "celebration_type": "middle",
                    "celebration_rank": "polyeleos",
                },
            ],
        }

        day = upsert_day(payload)

        self.assertIsNotNone(day.main_feast)
        self.assertEqual(day.main_feast.source_id, 602)

    def test_day_endpoint_can_return_ukrainian_calendar_text(self):
        feast = CalendarFeast.objects.create(
            source_id=701,
            title="Святитель",
            short_title="Святитель",
            title_uk="Святитель українською",
            short_title_uk="Святитель українською",
            troparion_content="Тропарь",
            troparion_content_uk="Тропар українською",
        )

        day = CalendarDay.objects.create(
            date_gregorian=date(2026, 10, 2),
            main_feast=feast,
            fast_type_code="fast",
            fast_type_title="Постный день",
            fast_type_title_uk="Пісний день",
            gospel_title="Мф. 10:17-22",
            gospel_title_uk="Мт. 10:17-22",
            source_payload={"imported_languages": ["ru", "uk"]},
        )
        day.feasts.add(feast)

        response = self.client.get(
            "/api/calendar/day/",
            {"date": "2026-10-02", "lang": "uk"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["main_feast"]["title"],
            "Святитель українською",
        )
        self.assertEqual(response.data["fast_type_title"], "Пісний день")
        self.assertEqual(response.data["gospel_title"], "Мт. 10:17-22")
        self.assertEqual(response.data["weekday_name"], "П’ятниця")


    def test_day_endpoint_returns_multiple_ordered_readings(self):
        day = CalendarDay.objects.create(
            date_gregorian=date(2026, 10, 3),
            gospel_title="Старое Евангелие",
            gospel_title_uk="Старе Євангеліє",
            apostolic_title="Старый Апостол",
            apostolic_title_uk="Старий Апостол",
        )

        CalendarReading.objects.create(
            day=day,
            kind=CalendarReading.KIND_GOSPEL,
            label="Ряд.",
            title="Ин. 8:21-30",
            order=20,
        )
        CalendarReading.objects.create(
            day=day,
            kind=CalendarReading.KIND_GOSPEL,
            label="Субботы по Воздвижении",
            title="Мф. 19:3-12",
            order=10,
        )
        CalendarReading.objects.create(
            day=day,
            kind=CalendarReading.KIND_APOSTLE,
            label="Вмч.",
            title="Еф. 6:10-17",
            order=10,
        )

        response = self.client.get(
            "/api/calendar/day/",
            {"date": "2026-10-03", "lang": "uk"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["title"] for item in response.data["readings"]],
            ["Мф. 19:3-12", "Ин. 8:21-30", "Еф. 6:10-17"],
        )
        self.assertEqual(response.data["gospel_title"], "Мф. 19:3-12")
        self.assertEqual(response.data["apostolic_title"], "Еф. 6:10-17")

    def test_importer_creates_structured_readings_from_source_titles(self):
        day = upsert_day(
            {
                "date_gregorian": "2026-10-04",
                "gospel_title": "Лк. 5:1-11",
                "apostolic_title": "2 Кор. 4:6-15",
            }
        )

        self.assertEqual(day.readings.count(), 2)
        self.assertEqual(
            list(day.readings.values_list("kind", "title")),
            [
                (CalendarReading.KIND_APOSTLE, "2 Кор. 4:6-15"),
                (CalendarReading.KIND_GOSPEL, "Лк. 5:1-11"),
            ],
        )
