from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0050_accountpreferences")]
    operations = [
        migrations.CreateModel(
            name="AccountDeletionRequest",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("email", models.EmailField(max_length=254)),
                ("kind", models.CharField(max_length=16, default="deletion", choices=[
                    ("deletion", "Удаление аккаунта"),
                    ("privacy", "Обращение по персональным данным"),
                ])),
                ("message", models.TextField(blank=True, max_length=1000)),
                ("status", models.CharField(max_length=16, default="pending", choices=[
                    ("pending", "Ожидает проверки личности"),
                    ("verified", "Личность подтверждена"),
                    ("completed", "Выполнено"),
                    ("closed", "Закрыто"),
                ])),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "verbose_name": "Запрос на удаление / конфиденциальность",
                "verbose_name_plural": "Запросы на удаление и конфиденциальность",
            },
        ),
    ]
