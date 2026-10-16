#!/usr/bin/env python3
"""Complete two approved calendar icons and create a read-only language audit."""
import csv
import os
import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

# The existing importer uses process environment variables, not automatic dotenv loading.
env_path = ROOT / '.env'
if env_path.exists():
    for raw in env_path.read_text(encoding='utf-8-sig').splitlines():
        match = re.match(r'^\s*(CLOUD_NAME|CLOUD_API_KEY|CLOUD_API_SECRET)\s*=\s*(.*?)\s*$', raw)
        if match:
            key, value = match.groups()
            value = value.strip().strip('"').strip("'")
            if value:
                os.environ.setdefault(key, value)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
import requests
from django.conf import settings
from api.calendar_models import CalendarDay, CalendarFeast
from api.calendar_icon_storage import cloudinary_configured, upload_azbyka_icon

TARGETS = [
    (date(2026, 3, 7), 3904, 'Мученики, иже во Евгении',
     'https://azbyka.ru/molitvoslov/wp-content/uploads/2023/03/6228717294452137784102.jpg',
     'https://azbyka.ru/days/sv-sobor-mucheniki-izhe-vo-evgenii'),
    (date(2026, 11, 7), 5723, 'Димитриевская родительская суббота',
     'https://kvitu.ua/image/catalog/blog/prazdniki/dimitrievskaya-roditel-skaya-subbota.jpg',
     'https://kvitu.ua/image/catalog/blog/prazdniki/dimitrievskaya-roditel-skaya-subbota.jpg'),
]

print('=== ПРОВЕРКА ===', flush=True)
for day_date, feast_id, expected_title, image_url, source_page in TARGETS:
    day = CalendarDay.objects.select_related('main_feast').get(date_gregorian=day_date)
    if day.main_feast_id != feast_id or day.main_feast.title.strip() != expected_title:
        raise SystemExit(f'СТОП: {day_date}: ID или название главной памяти отличается. В БД: {day.main_feast_id} / {day.main_feast.title!r}')
    print(f'{day_date} | ID {feast_id} | икона уже есть: {bool(day.main_feast.icon_url)}')

pending = [(d, fid, title, image_url, page) for d, fid, title, image_url, page in TARGETS
           if not CalendarFeast.objects.get(pk=fid).icon_url]
if pending and not cloudinary_configured():
    raise SystemExit('СТОП: отсутствуют переменные Cloudinary в окружении или .env')

# Check actual bytes rather than blindly trusting remote Content-Type.
for d, fid, title, image_url, page in pending:
    try:
        response = requests.get(image_url, timeout=35, headers={'User-Agent': 'Mozilla/5.0'}, stream=True)
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', '').split(';', 1)[0].lower().strip()
        prefix = next(response.iter_content(chunk_size=64), b'')
        response.close()
        signature = prefix.startswith(b'\xff\xd8\xff') or prefix.startswith(b'\x89PNG\r\n\x1a\n') or prefix.startswith(b'RIFF') and b'WEBP' in prefix[:16]
        if not signature or not content_type.startswith('image/'):
            raise ValueError(f'неожиданный файл: Content-Type={content_type}; image signature={signature}')
        print(f'Изображение {d}: HTTP OK, {content_type}')
    except Exception as exc:
        raise SystemExit(f'СТОП: ошибка проверки изображения {d}: {type(exc).__name__}: {exc}')

if pending:
    database = Path(settings.DATABASES['default']['NAME']).resolve()
    if not database.exists() or database.suffix.lower() != '.sqlite3':
        raise SystemExit(f'СТОП: ожидалась SQLite база, получено: {database}')
    output = ROOT / 'backups' / 'sqlite'
    output.mkdir(parents=True, exist_ok=True)
    dest_path = output / ('before_final_two_icons_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.sqlite3')
    with sqlite3.connect(str(database)) as src, sqlite3.connect(str(dest_path)) as dst:
        src.backup(dst)
    print('Backup:', dest_path, flush=True)

    for day_date, feast_id, title, image_url, source_page in pending:
        print(f'Загрузка в Cloudinary: {day_date} ...', flush=True)
        try:
            uploaded = upload_azbyka_icon(image_url, source_page)
            if not uploaded.startswith('https://res.cloudinary.com/'):
                raise ValueError(f'Неожиданный адрес результата Cloudinary: {uploaded}')
            changed = CalendarFeast.objects.filter(pk=feast_id, icon_url='').update(icon_url=uploaded)
            print(f'  {"СОХРАНЕНО" if changed else "УЖЕ БЫЛО"}: {uploaded}', flush=True)
        except Exception as exc:
            print(f'  ОШИБКА {day_date}: {type(exc).__name__}: {exc}', flush=True)

print('\n=== ПОЛНОТА 2026 ГОДА (ГЛАВНЫЕ ПАМЯТИ) ===')
days = list(CalendarDay.objects.filter(date_gregorian__year=2026).select_related('main_feast').prefetch_related('readings'))
full = len(days) == 365
for name, predicate in [
    ('С чтениями', lambda d: bool(d.readings.all())),
    ('С описанием/житием', lambda d: bool(d.main_feast and d.main_feast.life_content.strip())),
    ('С иконой', lambda d: bool(d.main_feast and d.main_feast.icon_url.strip())),
]:
    n = sum(predicate(d) for d in days)
    print(f'{name}: {n}/{len(days)}')
    if n != len(days):
        full = False
        print('  Требуют проверки:', ', '.join(str(d.date_gregorian) for d in days if not predicate(d)))
print('Дней:', len(days), '/365')

# Include every CalendarFeast, including secondary memories and orphaned records.
print('\n=== CSV-АУДИТ ТЕКСТОВ (БЕЗ ЗАМЕН) ===')
patterns = re.compile(
    r'(?iu)(?<![\w])(?:'
    r'росси[йяюиеёы̆][\w\u0300-\u036f]*|россий[\w\u0300-\u036f]*|'
    r'русск[\w\u0300-\u036f]*|'
    r'росси[\w\u0300-\u036f]*|'
    r'русь|руси|русью|русин[\w\u0300-\u036f]*|'
    r'великоросс[\w\u0300-\u036f]*|малоросс[\w\u0300-\u036f]*|'
    r'руськ[\w\u0300-\u036f]*'
    r')(?![\w])'
)
fields = ['life_content', 'troparion_content', 'kontakion_content']
report_dir = ROOT / 'reports'
report_dir.mkdir(exist_ok=True)
report = report_dir / 'calendar_national_terms_audit_2026.csv'
count = Counter()
with report.open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream, delimiter=';')
    writer.writerow(['feast_id', 'feast_title', 'field', 'match', 'context', 'full_field_length'])
    for feast in CalendarFeast.objects.all().iterator(chunk_size=300):
        for field in fields:
            value = getattr(feast, field) or ''
            for match in patterns.finditer(value):
                before = value[max(0, match.start() - 110):match.start()]
                after = value[match.end():match.end() + 110]
                context = re.sub(r'\s+', ' ', before + '⟦' + match.group(0) + '⟧' + after)
                writer.writerow([feast.pk, feast.title, field, match.group(0), context, len(value)])
                count[field] += 1
print('Отчёт:', report)
print('Совпадений:', sum(count.values()), '| по полям:', dict(count))
print('Редактирование текстов НЕ выполнялось.')
print('\n=== ГОТОВО ===')
