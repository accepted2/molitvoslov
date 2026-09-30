from django.db import models


class CalendarFeast(models.Model):
    """Одна календарная память/праздник, перенесённая из Church Site."""

    source_id = models.PositiveIntegerField(unique=True, db_index=True)
    date_type = models.CharField(max_length=20, blank=True, default="")
    celebration_type = models.CharField(max_length=20, blank=True, default="")
    celebration_rank = models.CharField(max_length=30, blank=True, default="")

    title = models.TextField()
    short_title = models.TextField(blank=True, default="")

    julian_month = models.PositiveSmallIntegerField(null=True, blank=True)
    julian_day = models.PositiveSmallIntegerField(null=True, blank=True)
    easter_offset = models.IntegerField(null=True, blank=True)

    icon_url = models.URLField(max_length=1000, blank=True, default="")

    troparion_title = models.TextField(blank=True, default="")
    troparion_content = models.TextField(blank=True, default="")
    troparion_echo = models.PositiveSmallIntegerField(null=True, blank=True)

    kontakion_title = models.TextField(blank=True, default="")
    kontakion_content = models.TextField(blank=True, default="")
    kontakion_echo = models.PositiveSmallIntegerField(null=True, blank=True)

    life_title = models.TextField(blank=True, default="")
    life_content = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")

    all_dates = models.JSONField(default=list, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]
        verbose_name = "Календарь: святой / праздник"
        verbose_name_plural = "Календарь: святые / праздники"

    def __str__(self):
        return self.short_title or self.title


class CalendarDay(models.Model):
    """Готовый календарный день для мобильного приложения."""

    date_gregorian = models.DateField(unique=True, db_index=True)
    julian_month = models.PositiveSmallIntegerField(null=True, blank=True)
    julian_day = models.PositiveSmallIntegerField(null=True, blank=True)

    main_feast = models.ForeignKey(
        CalendarFeast,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="main_days",
    )
    feasts = models.ManyToManyField(
        CalendarFeast,
        blank=True,
        related_name="calendar_days",
    )

    fast_type_code = models.CharField(max_length=50, blank=True, default="")
    fast_type_title = models.TextField(blank=True, default="")
    fast_name = models.TextField(blank=True, default="")
    fast_description = models.TextField(blank=True, default="")

    summary = models.TextField(blank=True, default="")
    short_summary = models.TextField(blank=True, default="")

    gospel_title = models.TextField(blank=True, default="")
    gospel_reading = models.TextField(blank=True, default="")
    apostolic_title = models.TextField(blank=True, default="")
    apostolic_reading = models.TextField(blank=True, default="")

    source_payload = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date_gregorian"]
        verbose_name = "Календарь: день"
        verbose_name_plural = "Календарь: дни"

    def __str__(self):
        return self.date_gregorian.isoformat()
