from rest_framework import serializers

from .calendar_models import CalendarDay, CalendarFeast


class CalendarFeastSerializer(serializers.ModelSerializer):
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


class CalendarDaySerializer(serializers.ModelSerializer):
    main_feast = CalendarFeastSerializer(read_only=True)
    all_feasts = CalendarFeastSerializer(source="feasts", many=True, read_only=True)
    date_str = serializers.SerializerMethodField()
    weekday = serializers.SerializerMethodField()
    weekday_name = serializers.SerializerMethodField()
    week_number = serializers.SerializerMethodField()
    is_today = serializers.SerializerMethodField()

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
            "main_feast",
            "all_feasts",
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

    def get_date_str(self, obj):
        return obj.date_gregorian.isoformat()

    def get_weekday(self, obj):
        return obj.date_gregorian.weekday()

    def get_weekday_name(self, obj):
        return [
            "Понедельник",
            "Вторник",
            "Среда",
            "Четверг",
            "Пятница",
            "Суббота",
            "Воскресенье",
        ][obj.date_gregorian.weekday()]

    def get_week_number(self, obj):
        return obj.date_gregorian.isocalendar()[1]

    def get_is_today(self, obj):
        from django.utils import timezone
        return obj.date_gregorian == timezone.localdate()
