from django.urls import path

from .calendar_views import (
    CalendarDayView,
    CalendarMonthView,
    CalendarWeekView,
    CalendarYearMarkersView,
    CalendarFeastDetailView,
)


urlpatterns = [
    path("feast/<int:source_id>/", CalendarFeastDetailView.as_view(), name="calendar-feast-by-source"),
    path("feast-id/<int:pk>/", CalendarFeastDetailView.as_view(), name="calendar-feast-by-id"),
    path("year-markers/", CalendarYearMarkersView.as_view(), name="calendar-year-markers"),
    path("day/", CalendarDayView.as_view(), name="calendar-day"),
    path("month/", CalendarMonthView.as_view(), name="calendar-month"),
    path("week/", CalendarWeekView.as_view(), name="calendar-week"),
]
