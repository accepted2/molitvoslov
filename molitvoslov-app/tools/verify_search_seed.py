#!/usr/bin/env python3
"""Validate bundled FTS5 database against the APK's offline JSON snapshots.

Run before creating a Release APK. Exits non-zero on any mismatch.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEARCH = ROOT / 'src/data/search_seed.db'
CONTENT = ROOT / 'src/data/offlineContent.json'
BIBLE = ROOT / 'src/data/offlineBible.json'
SCHEMA = '9'

def main():
    for p in (SEARCH, CONTENT, BIBLE):
        if not p.is_file():
            raise RuntimeError(f'Missing build input: {p}')
    content = json.loads(CONTENT.read_text(encoding='utf-8-sig'))
    bible = json.loads(BIBLE.read_text(encoding='utf-8-sig'))
    expected_public = content.get('content_version') or content.get('generated_at') or 'bundle-public'
    expected_bible = bible.get('content_version') or bible.get('generated_at') or 'bundle-bible'
    with sqlite3.connect(f'file:{SEARCH.as_posix()}?mode=ro', uri=True) as db:
        integrity = db.execute('PRAGMA quick_check').fetchone()[0]
        if integrity != 'ok':
            raise RuntimeError(f'Invalid SQLite database: {integrity}')
        table_names = {r[0] for r in db.execute('SELECT name FROM sqlite_master WHERE type IN ("table", "view")')}
        required = {'search_documents', 'search_documents_content', 'search_payloads', 'search_metadata'}
        missing = required - table_names
        if missing:
            raise RuntimeError(f'Missing search tables: {sorted(missing)}')
        rows = db.execute('SELECT language, version FROM search_metadata').fetchall()
        metadata = dict(rows)
        if len(metadata) != len(rows):
            raise RuntimeError('Duplicate search metadata languages')
        for language in ('ru', 'uk'):
            expected = f'{SCHEMA}:{language}:{expected_public}:{expected_bible}'
            actual = metadata.get(language)
            if actual != expected:
                raise RuntimeError(f'OUTDATED SEARCH SEED for {language}.\nexpected: {expected}\nactual:   {actual}\nRun: python tools/build_search_seed.py')
        n = db.execute('SELECT count(*) FROM search_payloads').fetchone()[0]
        if n < 100:
            raise RuntimeError(f'Search seed seems incomplete: only {n} records')
        test = db.execute("SELECT count(*) FROM search_documents WHERE search_documents MATCH 'богородица'").fetchone()[0]
        print(f'VALID SEARCH SEED: records={n}, богородица_matches={test}, size={SEARCH.stat().st_size} bytes')

if __name__ == '__main__':
    try:
        main()
    except (OSError, sqlite3.Error, ValueError, RuntimeError) as ex:
        print(f'SEARCH SEED ERROR: {ex}', file=sys.stderr)
        sys.exit(1)
