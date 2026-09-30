from datetime import date

from rest_framework.test import APITestCase

from api.calendar_import import upsert_day
from api.calendar_models import CalendarDay, CalendarFeast


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
