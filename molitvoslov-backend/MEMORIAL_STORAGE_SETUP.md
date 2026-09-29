# Помянник: облачное хранение фотографий

Текстовые данные помянника хранятся в PostgreSQL. Фотографии хранятся в приватном Supabase Storage bucket и выдаются мобильному приложению через временные signed URL.

## Supabase Storage

Создайте **private** bucket:

```text
memorials
```

Публичный доступ к bucket не нужен: загрузка, удаление и подпись URL выполняются только Django backend после проверки DRF-пользователя.

## Переменные окружения backend

На Render задайте:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
MEMORIAL_STORAGE_BUCKET=memorials
```

Для доступа backend к Storage предпочтительно использовать новый server-side secret key:

```text
SUPABASE_SECRET_KEY=<secret key>
```

Для обратной совместимости код также поддерживает legacy:

```text
SUPABASE_SERVICE_ROLE_KEY=<legacy service_role key>
```

Никогда не добавляйте эти ключи в Git, мобильное приложение или публичные переменные окружения.

При необходимости лимит одной фотографии можно изменить:

```text
MEMORIAL_PHOTO_MAX_BYTES=12582912
```

По умолчанию используется 12 MiB.

## Миграция

После деплоя backend:

```powershell
python manage.py migrate
```

Миграция `0033_memorialbook_memorialphoto` создаёт таблицы помянников и фотографий.

## Поведение при недоступном Storage

Имена продолжают работать и синхронизироваться независимо от Storage.

Если фотография уже сохранена на телефоне, она остаётся локально. Неудачная облачная загрузка остаётся в статусе pending и может быть повторена при следующей синхронизации.
