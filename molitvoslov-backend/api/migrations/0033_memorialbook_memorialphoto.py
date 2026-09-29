# Generated manually for the local-first memorial book feature.

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0032_readingprogress_deleted_at_readingprogress_metadata_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="MemorialBook",
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
                        verbose_name="ID синхронизации",
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        default="Мой помянник",
                        max_length=120,
                        verbose_name="Название",
                    ),
                ),
                (
                    "health_names",
                    models.JSONField(
                        blank=True,
                        default=list,
                        verbose_name="О здравии",
                    ),
                ),
                (
                    "repose_names",
                    models.JSONField(
                        blank=True,
                        default=list,
                        verbose_name="Об упокоении",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        auto_now_add=True,
                        verbose_name="Создано",
                    ),
                ),
                (
                    "updated_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now,
                        verbose_name="Обновлено",
                    ),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(
                        blank=True,
                        null=True,
                        verbose_name="Удалено",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memorial_books",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
            ],
            options={
                "verbose_name": "Помянник",
                "verbose_name_plural": "Помянники",
                "ordering": ["-updated_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="MemorialPhoto",
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
                        verbose_name="ID синхронизации",
                    ),
                ),
                (
                    "storage_path",
                    models.CharField(
                        max_length=500,
                        unique=True,
                        verbose_name="Путь в хранилище",
                    ),
                ),
                (
                    "original_name",
                    models.CharField(
                        blank=True,
                        max_length=255,
                        verbose_name="Имя файла",
                    ),
                ),
                (
                    "content_type",
                    models.CharField(
                        blank=True,
                        max_length=100,
                        verbose_name="MIME-тип",
                    ),
                ),
                (
                    "order",
                    models.PositiveIntegerField(
                        default=0,
                        verbose_name="Порядок",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        auto_now_add=True,
                        verbose_name="Создано",
                    ),
                ),
                (
                    "updated_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now,
                        verbose_name="Обновлено",
                    ),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(
                        blank=True,
                        null=True,
                        verbose_name="Удалено",
                    ),
                ),
                (
                    "book",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="photos",
                        to="api.memorialbook",
                        verbose_name="Помянник",
                    ),
                ),
            ],
            options={
                "verbose_name": "Фото помянника",
                "verbose_name_plural": "Фото помянника",
                "ordering": ["order", "created_at", "id"],
            },
        ),
    ]
