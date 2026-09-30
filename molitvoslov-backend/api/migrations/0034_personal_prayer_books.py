# Generated manually for the personal prayer book feature.

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0033_memorialbook_memorialphoto"),
    ]

    operations = [
        migrations.CreateModel(
            name="PersonalPrayerBook",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sync_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        default="Мой молитвослов",
                        max_length=160,
                    ),
                ),
                (
                    "description",
                    models.TextField(blank=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="personal_prayer_books",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Личный молитвослов",
                "verbose_name_plural": "Личные молитвословы",
                "ordering": ["-updated_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="PersonalPrayer",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sync_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "title",
                    models.CharField(max_length=255),
                ),
                (
                    "text",
                    models.TextField(blank=True),
                ),
                (
                    "origin_type",
                    models.CharField(
                        choices=[
                            ("custom", "Добавлено пользователем"),
                            ("saved", "Из сохранённого"),
                            ("library", "Из библиотеки приложения"),
                        ],
                        default="custom",
                        max_length=20,
                    ),
                ),
                (
                    "origin_data",
                    models.JSONField(blank=True, default=dict),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="personal_prayers",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Личная молитва",
                "verbose_name_plural": "Личные молитвы",
                "ordering": ["-updated_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="PersonalPrayerPhoto",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sync_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "storage_path",
                    models.CharField(max_length=500, unique=True),
                ),
                (
                    "original_name",
                    models.CharField(blank=True, max_length=255),
                ),
                (
                    "content_type",
                    models.CharField(blank=True, max_length=100),
                ),
                (
                    "order",
                    models.PositiveIntegerField(default=0),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "prayer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="photos",
                        to="api.personalprayer",
                    ),
                ),
            ],
            options={
                "verbose_name": "Фото личной молитвы",
                "verbose_name_plural": "Фото личных молитв",
                "ordering": ["order", "created_at", "id"],
            },
        ),
        migrations.CreateModel(
            name="PersonalPrayerBookItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sync_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        unique=True,
                    ),
                ),
                (
                    "order",
                    models.PositiveIntegerField(default=0),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "book",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="api.personalprayerbook",
                    ),
                ),
                (
                    "prayer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="book_items",
                        to="api.personalprayer",
                    ),
                ),
            ],
            options={
                "verbose_name": "Молитва в личном молитвослове",
                "verbose_name_plural": "Молитвы в личных молитвословах",
                "ordering": ["order", "created_at", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="personalprayerbookitem",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("book", "prayer"),
                name="unique_active_personal_prayer_in_book",
            ),
        ),
    ]
