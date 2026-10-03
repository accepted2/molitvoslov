from django.db import models
import uuid


class CalendarFeast(models.Model):
    """Одна календарная память/праздник, перенесённая из Church Site."""

    source_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        unique=True,
        db_index=True,
    )

    sync_uid = models.UUIDField(
        null=True,
        blank=True,
        unique=True,
        editable=False,
        db_index=True,
    )
    date_type = models.CharField(max_length=20, blank=True, default="")
    celebration_type = models.CharField(max_length=20, blank=True, default="")
    celebration_rank = models.CharField(max_length=30, blank=True, default="")

    title = models.TextField()
    short_title = models.TextField(blank=True, default="")
    title_uk = models.TextField(blank=True, default="")
    short_title_uk = models.TextField(blank=True, default="")

    julian_month = models.PositiveSmallIntegerField(null=True, blank=True)
    julian_day = models.PositiveSmallIntegerField(null=True, blank=True)
    easter_offset = models.IntegerField(null=True, blank=True)

    icon_url = models.URLField(max_length=1000, blank=True, default="")

    troparion_title = models.TextField(blank=True, default="")
    troparion_content = models.TextField(blank=True, default="")
    troparion_title_uk = models.TextField(blank=True, default="")
    troparion_content_uk = models.TextField(blank=True, default="")
    troparion_echo = models.PositiveSmallIntegerField(null=True, blank=True)

    kontakion_title = models.TextField(blank=True, default="")
    kontakion_content = models.TextField(blank=True, default="")
    kontakion_title_uk = models.TextField(blank=True, default="")
    kontakion_content_uk = models.TextField(blank=True, default="")
    kontakion_echo = models.PositiveSmallIntegerField(null=True, blank=True)

    life_title = models.TextField(blank=True, default="")
    life_content = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")
    life_title_uk = models.TextField(blank=True, default="")
    life_content_uk = models.TextField(blank=True, default="")
    description_uk = models.TextField(blank=True, default="")

    all_dates = models.JSONField(default=list, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]
        verbose_name = "Календарь: святой / праздник"
        verbose_name_plural = "Календарь: святые / праздники"

    def __str__(self):
        return self.short_title or self.title


class CalendarFastType(models.Model):
    sync_uid = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
    )

    code = models.SlugField(
        max_length=80,
        unique=True,
        verbose_name="Код",
    )

    type_title = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Тип поста RU",
    )

    name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Название RU",
    )

    description = models.TextField(
        blank=True,
        default="",
        verbose_name="Описание RU",
    )

    type_title_uk = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Тип поста UK",
    )

    name_uk = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Название UK",
    )

    description_uk = models.TextField(
        blank=True,
        default="",
        verbose_name="Описание UK",
    )

    order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок",
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен",
    )

    class Meta:
        ordering = ["order", "name", "type_title", "code"]
        verbose_name = "Календарь: пост"
        verbose_name_plural = "Календарь: посты"

    def __str__(self):
        return self.name or self.type_title or self.code


class CalendarDay(models.Model):
    """Готовый календарный день для мобильного приложения."""

    date_gregorian = models.DateField(unique=True, db_index=True)
    julian_month = models.PositiveSmallIntegerField(null=True, blank=True)
    julian_day = models.PositiveSmallIntegerField(null=True, blank=True)

    fast_type = models.ForeignKey(
        CalendarFastType,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="calendar_days",
        verbose_name="Пост",
    )
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
    fast_type_title_uk = models.TextField(blank=True, default="")
    fast_name_uk = models.TextField(blank=True, default="")
    fast_description_uk = models.TextField(blank=True, default="")

    summary = models.TextField(blank=True, default="")
    short_summary = models.TextField(blank=True, default="")
    summary_uk = models.TextField(blank=True, default="")
    short_summary_uk = models.TextField(blank=True, default="")

    gospel_title = models.TextField(blank=True, default="")
    gospel_reading = models.TextField(blank=True, default="")
    apostolic_title = models.TextField(blank=True, default="")
    apostolic_reading = models.TextField(blank=True, default="")
    gospel_title_uk = models.TextField(blank=True, default="")
    gospel_reading_uk = models.TextField(blank=True, default="")
    apostolic_title_uk = models.TextField(blank=True, default="")
    apostolic_reading_uk = models.TextField(blank=True, default="")

    source_payload = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date_gregorian"]
        verbose_name = "Календарь: день"
        verbose_name_plural = "Календарь: дни"

    def __str__(self):
        return self.date_gregorian.isoformat()


class CalendarReading(models.Model):
    """Одно евангельское или апостольское чтение календарного дня."""

    KIND_GOSPEL = "gospel"
    KIND_APOSTLE = "apostle"
    KIND_CHOICES = [
        (KIND_GOSPEL, "Евангелие"),
        (KIND_APOSTLE, "Апостол"),
    ]

    sync_uid = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
    )
    day = models.ForeignKey(
        CalendarDay,
        on_delete=models.CASCADE,
        related_name="readings",
        verbose_name="Календарный день",
    )
    kind = models.CharField(
        max_length=16,
        choices=KIND_CHOICES,
        db_index=True,
        verbose_name="Тип",
    )
    label = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Подпись",
        help_text="Необязательно: например «Ряд.», «Субботы по Воздвижении», «Вмч.»",
    )
    title = models.TextField(
        verbose_name="Ссылка на чтение",
        help_text="Одна ссылка на чтение, например «1 Кор. 1:26-29». Одинакова для RU и UK.",
    )
    order = models.PositiveSmallIntegerField(
        default=0,
        verbose_name="Порядок",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kind", "order", "id"]
        indexes = [
            models.Index(fields=["day", "kind", "order"]),
        ]
        verbose_name = "Календарь: чтение"
        verbose_name_plural = "Календарь: чтения"

    def __str__(self):
        return f"{self.get_kind_display()}: {self.title}"
