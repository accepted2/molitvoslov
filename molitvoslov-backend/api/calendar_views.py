from calendar import monthrange
from datetime import date, datetime

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .calendar_import import ensure_day, ensure_month
from .calendar_models import CalendarDay
from .calendar_serializers import CalendarDaySerializer


def request_language(request):
    value = (request.query_params.get("lang") or "").lower()

    if value in {"ru", "uk"}:
        return value

    header = (request.headers.get("Accept-Language") or "").lower()
    return "uk" if header.startswith("uk") else "ru"


def calendar_queryset():
    return CalendarDay.objects.select_related(
        "main_feast",
        "fast_type",
    ).prefetch_related("feasts")


def serialize_day(day, request):
    return CalendarDaySerializer(
        day,
        context={"request": request},
    ).data


class CalendarDayView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        raw_date = request.query_params.get("date")

        if raw_date:
            try:
                target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"detail": "Используйте дату в формате YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            target_date = timezone.localdate()

        language = request_language(request)
        day = calendar_queryset().filter(date_gregorian=target_date).first()

        # Чтение календаря не должно перезаписывать уже существующие данные.
        # Источник Church Site используем только если самого дня ещё нет.
        # Отсутствующая локализация безопасно откатывается к RU в сериализаторе.
        if day is None:
            try:
                ensure_day(target_date, language=language)
            except Exception as error:
                return Response(
                    {
                        "detail": "Данные церковного календаря пока недоступны.",
                        "source_error": str(error),
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            day = calendar_queryset().filter(date_gregorian=target_date).first()

        if day is None:
            return Response(
                {"detail": "Нет данных для выбранной даты."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(serialize_day(day, request))


class CalendarMonthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        today = timezone.localdate()

        try:
            year = int(request.query_params.get("year") or today.year)
            month = int(request.query_params.get("month") or today.month)
        except (TypeError, ValueError):
            return Response(
                {"detail": "year и month должны быть числами."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if month < 1 or month > 12 or year < 1900 or year > 2200:
            return Response(
                {"detail": "Некорректный год или месяц."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expected_days = monthrange(year, month)[1]
        local_count = CalendarDay.objects.filter(
            date_gregorian__year=year,
            date_gregorian__month=month,
        ).count()

        language = request_language(request)
        source_error = ""

        # Полный локальный месяц читаем как есть. Обычный GET и переключение
        # языка не должны запускать повторный импорт и менять ручные правки.
        if local_count < expected_days:
            try:
                ensure_month(year, month, language=language)
            except Exception as error:
                source_error = str(error)

        days = calendar_queryset().filter(
            date_gregorian__year=year,
            date_gregorian__month=month,
        )

        serialized = CalendarDaySerializer(
            days,
            many=True,
            context={"request": request},
        ).data

        if not serialized and source_error:
            return Response(
                {
                    "detail": "Данные церковного календаря пока недоступны.",
                    "source_error": source_error,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "year": year,
                "month": month,
                "language": language,
                "days": serialized,
                "total_days": len(serialized),
                "start_date": date(year, month, 1).isoformat(),
                "end_date": date(year, month, expected_days).isoformat(),
                "source_error": source_error or None,
            }
        )


class CalendarWeekView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        raw_date = request.query_params.get("date")

        if raw_date:
            try:
                target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"detail": "Используйте дату в формате YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            target_date = timezone.localdate()

        monday = target_date.fromordinal(target_date.toordinal() - target_date.weekday())
        sunday = monday.fromordinal(monday.toordinal() + 6)
        language = request_language(request)

        days = calendar_queryset().filter(
            date_gregorian__gte=monday,
            date_gregorian__lte=sunday,
        )

        # Неделя тоже является read-only API. Подтягиваем источник только если
        # локально вообще не хватает календарных дней.
        if days.count() < 7:
            for year, month in {
                (monday.year, monday.month),
                (sunday.year, sunday.month),
            }:
                try:
                    ensure_month(year, month, language=language)
                except Exception:
                    pass

            days = calendar_queryset().filter(
                date_gregorian__gte=monday,
                date_gregorian__lte=sunday,
            )

        return Response(
            {
                "week_number": target_date.isocalendar()[1],
                "start_date": monday.isoformat(),
                "end_date": sunday.isoformat(),
                "language": language,
                "days": CalendarDaySerializer(
                    days,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )
