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


def calendar_queryset():
    return CalendarDay.objects.select_related("main_feast").prefetch_related("feasts")


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

        day = calendar_queryset().filter(date_gregorian=target_date).first()

        if day is None:
            try:
                ensure_day(target_date)
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

        return Response(CalendarDaySerializer(day).data)


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

        source_error = ""

        if local_count < expected_days:
            try:
                ensure_month(year, month)
            except Exception as error:
                source_error = str(error)

        days = calendar_queryset().filter(
            date_gregorian__year=year,
            date_gregorian__month=month,
        )

        serialized = CalendarDaySerializer(days, many=True).data

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

        for year, month in {
            (monday.year, monday.month),
            (sunday.year, sunday.month),
        }:
            try:
                ensure_month(year, month)
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
                "days": CalendarDaySerializer(days, many=True).data,
            }
        )
