from rest_framework import serializers

from .calendar_localization import same_feast_identity
from .calendar_models import CalendarDay, CalendarFeast, CalendarReading


def _language_from_context(context):
    request = context.get("request") if context else None

    if request is None:
        return "ru"

    query_language = (request.query_params.get("lang") or "").lower()
    if query_language in {"ru", "uk"}:
        return query_language

    header = (request.headers.get("Accept-Language") or "").lower()
    if header.startswith("uk"):
        return "uk"

    return "ru"


def _localized(obj, field, language):
    if language == "uk":
        value = getattr(obj, f"{field}_uk", "")
        if value:
            return value

    return getattr(obj, field, "")


class CalendarFeastSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    short_title = serializers.SerializerMethodField()
    troparion_title = serializers.SerializerMethodField()
    troparion_content = serializers.SerializerMethodField()
    kontakion_title = serializers.SerializerMethodField()
    kontakion_content = serializers.SerializerMethodField()
    life_title = serializers.SerializerMethodField()
    life_content = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = CalendarFeast
        fields = [
            "id",
            "source_id",
            "date_type",
            "celebration_type",
            "celebration_rank",
            "title",
            "short_title",
            "julian_month",
            "julian_day",
            "easter_offset",
            "icon_url",
            "troparion_title",
            "troparion_content",
            "troparion_echo",
            "kontakion_title",
            "kontakion_content",
            "kontakion_echo",
            "life_title",
            "life_content",
            "description",
            "all_dates",
        ]

    def _get(self, obj, field):
        language = _language_from_context(self.context)

        if language == "uk" and not same_feast_identity(obj.title, obj.title_uk):
            return getattr(obj, field, "")

        return _localized(obj, field, language)

    def get_title(self, obj):
        return self._get(obj, "title")

    def get_short_title(self, obj):
        return self._get(obj, "short_title")

    def get_troparion_title(self, obj):
        return self._get(obj, "troparion_title")

    def get_troparion_content(self, obj):
        return self._get(obj, "troparion_content")

    def get_kontakion_title(self, obj):
        return self._get(obj, "kontakion_title")

    def get_kontakion_content(self, obj):
        return self._get(obj, "kontakion_content")

    def get_life_title(self, obj):
        return self._get(obj, "life_title")

    def get_life_content(self, obj):
        return self._get(obj, "life_content")

    def get_description(self, obj):
        return self._get(obj, "description")


class CalendarReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarReading
        fields = [
            "id",
            "kind",
            "label",
            "title",
            "order",
        ]


class CalendarDaySerializer(serializers.ModelSerializer):
    main_feast = CalendarFeastSerializer(read_only=True)
    all_feasts = CalendarFeastSerializer(source="feasts", many=True, read_only=True)
    readings = CalendarReadingSerializer(many=True, read_only=True)
    date_str = serializers.SerializerMethodField()
    weekday = serializers.SerializerMethodField()
    weekday_name = serializers.SerializerMethodField()
    week_number = serializers.SerializerMethodField()
    is_today = serializers.SerializerMethodField()
    language = serializers.SerializerMethodField()

    fast_type_code = serializers.SerializerMethodField()
    fast_type_title = serializers.SerializerMethodField()
    fast_name = serializers.SerializerMethodField()
    fast_description = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    short_summary = serializers.SerializerMethodField()
    gospel_title = serializers.SerializerMethodField()
    gospel_reading = serializers.SerializerMethodField()
    apostolic_title = serializers.SerializerMethodField()
    apostolic_reading = serializers.SerializerMethodField()

    class Meta:
        model = CalendarDay
        fields = [
            "id",
            "date_gregorian",
            "date_str",
            "julian_month",
            "julian_day",
            "weekday",
            "weekday_name",
            "week_number",
            "is_today",
            "language",
            "main_feast",
            "all_feasts",
            "readings",
            "fast_type_code",
            "fast_type_title",
            "fast_name",
            "fast_description",
            "summary",
            "short_summary",
            "gospel_title",
            "gospel_reading",
            "apostolic_title",
            "apostolic_reading",
        ]

    def _language(self):
        return _language_from_context(self.context)

    def _get(self, obj, field):
        return _localized(obj, field, self._language())

    def get_date_str(self, obj):
        return obj.date_gregorian.isoformat()

    def get_weekday(self, obj):
        return obj.date_gregorian.weekday()

    def get_weekday_name(self, obj):
        names = {
            "ru": [
                "Понедельник",
                "Вторник",
                "Среда",
                "Четверг",
                "Пятница",
                "Суббота",
                "Воскресенье",
            ],
            "uk": [
                "Понеділок",
                "Вівторок",
                "Середа",
                "Четвер",
                "П’ятниця",
                "Субота",
                "Неділя",
            ],
        }

        return names[self._language()][obj.date_gregorian.weekday()]

    def get_week_number(self, obj):
        return obj.date_gregorian.isocalendar()[1]

    def get_is_today(self, obj):
        from django.utils import timezone

        return obj.date_gregorian == timezone.localdate()

    def get_language(self, obj):
        return self._language()

    def get_fast_type_code(self, obj):
        if obj.fast_type:
            return obj.fast_type.code

        return obj.fast_type_code

    def get_fast_type_title(self, obj):
        if obj.fast_type:
            return _localized(
                obj.fast_type,
                "type_title",
                self._language(),
            )

        return self._get(obj, "fast_type_title")

    def get_fast_name(self, obj):
        if obj.fast_type:
            return _localized(
                obj.fast_type,
                "name",
                self._language(),
            )

        return self._get(obj, "fast_name")

    def get_fast_description(self, obj):
        if obj.fast_type:
            return _localized(
                obj.fast_type,
                "description",
                self._language(),
            )

        return self._get(obj, "fast_description")

    def get_summary(self, obj):
        return self._get(obj, "summary")

    def get_short_summary(self, obj):
        return self._get(obj, "short_summary")

    def _first_reading_title(self, obj, kind):
        for reading in obj.readings.all():
            if reading.kind == kind and reading.title:
                return reading.title

        return ""

    def get_gospel_title(self, obj):
        return self._first_reading_title(obj, CalendarReading.KIND_GOSPEL) or self._get(
            obj,
            "gospel_title",
        )

    def get_gospel_reading(self, obj):
        return self._get(obj, "gospel_reading")

    def get_apostolic_title(self, obj):
        return self._first_reading_title(obj, CalendarReading.KIND_APOSTLE) or self._get(
            obj,
            "apostolic_title",
        )

    def get_apostolic_reading(self, obj):
        return self._get(obj, "apostolic_reading")
