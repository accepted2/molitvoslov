from django.urls import path

from .calendar_views import CalendarDayView, CalendarMonthView, CalendarWeekView


urlpatterns = [
    path("day/", CalendarDayView.as_view(), name="calendar-day"),
    path("month/", CalendarMonthView.as_view(), name="calendar-month"),
    path("week/", CalendarWeekView.as_view(), name="calendar-week"),
]
