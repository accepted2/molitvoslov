#!/usr/bin/env python3
"""One-time targeted export from TEST Supabase to local bundled offlineContent.json.

Run from molitvoslov-app using the backend venv, with TEST Supabase environment set.
Does not modify Supabase or the original JSON: writes offlineContent_merged.json.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
BACKEND = APP.parent / 'molitvoslov-backend'
INPUT = APP / 'src/data/offlineContent.json'
OUTPUT = APP / 'src/data/offlineContent_merged.json'
TEST_ID = 'fyjnbwlguisuhwvlpcyf'
PRAYERS = {
    'molitva-svyatogo-pravednogo-ioanna-kronshtadtskogo',
    'molitva-inaya-svyatogo-pravednogo-ioanna-kronshtadtskogo',
    'molitva-ko-presvyatoj-troice-svyatogo-pravednogo-ioanna-kronshtadtskogo',
    'molitva-optinskih-starcev',
    'molitva-poslednih-optinskih-starcev',
}

def main():
    if OUTPUT.exists():
        raise RuntimeError(f'Output exists, inspect or move it first: {OUTPUT}')
    if not BACKEND.joinpath('manage.py').exists():
        raise RuntimeError(f'Backend checkout missing: {BACKEND}')
    # Defensive guard: even an accidental production connection must never be used.
    configured = ' '.join(os.getenv(key, '') for key in ('SUPABASE_DB_USER', 'SUPABASE_DB_HOST'))
    if TEST_ID not in configured:
        raise RuntimeError('TEST Supabase not configured. Set SUPABASE_DB_USER to postgres.' + TEST_ID + ' and test pooler host.')
    sys.path.insert(0, str(BACKEND))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
    from django.db import connection
    from api.models import Akathist, Category, CategoryText, Text
    from api.serializers import (AkathistSerializer, AkathistSummarySerializer,
                                 CategoryTextSerializer, TextSerializer)
    with connection.cursor() as cur:
        cur.execute('SELECT current_database(), current_user')
        db_name, db_user = cur.fetchone()
    if TEST_ID not in str(db_user):
        raise RuntimeError('Wrong database connection user: ' + str(db_user))

    bundle = json.loads(INPUT.read_text(encoding='utf-8-sig'))
    texts = list(Text.objects.filter(slug__in=PRAYERS, is_visible=True).prefetch_related('categories'))
    existing = {t.slug for t in texts}
    if existing != PRAYERS:
        raise RuntimeError(f'Missing visible prayers in TEST Supabase: {sorted(PRAYERS - existing)}')
    serialized = list(TextSerializer(texts, many=True).data)
    for row in serialized:
        bundle['texts'][row['slug']] = row

    category_slugs = set()
    for obj in texts:
        category_slugs.update(obj.categories.values_list('slug', flat=True))
    for slug in sorted(category_slugs):
        category = Category.objects.get(slug=slug)
        category_rows = (CategoryText.objects.filter(category=category)
                         .select_related('category', 'text')
                         .prefetch_related('text__categories').order_by('order', 'id'))
        # Category list is serialized as one unit to keep order and navigation valid.
        bundle['category_texts'][slug] = CategoryTextSerializer(category_rows, many=True).data

    matches = [a for a in Akathist.objects.filter(is_visible=True)
               if 'избавлен' in (a.title or '').lower() and 'бед' in (a.title or '').lower()]
    if len(matches) != 1:
        raise RuntimeError(f'Expected exactly one visible akathist about Izbavlenie ot bed; found {[(a.pk,a.slug) for a in matches]}')
    aka = (Akathist.objects.filter(pk=matches[0].pk)
           .select_related('troparion', 'kontakion_before')
           .prefetch_related('sections__text__categories').get())
    detail = AkathistSerializer(aka).data
    bundle['akathists']['by_slug'][aka.slug] = detail
    summaries = list(AkathistSummarySerializer(Akathist.objects.filter(is_visible=True).order_by('id'), many=True).data)
    bundle['akathists']['list'] = summaries
    related_ids = {section.text_id for section in aka.sections.all() if section.text_id}
    related_ids.update(v.pk for v in (aka.troparion, aka.kontakion_before) if v is not None)
    related = Text.objects.filter(pk__in=related_ids, is_visible=True).prefetch_related('categories')
    for row in TextSerializer(related, many=True).data:
        bundle['texts'][row['slug']] = row

    # Same canonical content hash algorithm as api.mobile_content.build_mobile_content_payload.
    content = {k:v for k,v in bundle.items() if k not in ('schema_version', 'content_version', 'generated_at')}
    encoded = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    bundle['content_version'] = hashlib.sha256(encoded).hexdigest()
    OUTPUT.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print('TEST database:', db_name, db_user)
    print('Added/updated prayers:', len(serialized), 'categories refreshed:', sorted(category_slugs))
    print('Akathist:', aka.slug, 'sections:', len(detail.get('sections') or []))
    print('Related text records:', related.count())
    print('New content_version:', bundle['content_version'])
    print('Output (original untouched):', OUTPUT)
    print('IMPORTANT: do not replace the original file or build APK before patching and verifying search seed against this new content.')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('EXPORT FAILED:', exc, file=sys.stderr)
        sys.exit(1)
