#!/usr/bin/env python3
"""Read-only size and content diagnostics for two Molitvoslov search SQLite databases.

Usage:
  python -X utf8 diagnose_search_sqlite.py OLD_SEARCH_SEED.db NEW_SEARCH_SEED.db

Works on Windows / Python 3.14. Does not modify either database.
"""

from __future__ import annotations

import hashlib
import sqlite3
import sys
from collections import Counter
from pathlib import Path

MIB = 1024 * 1024


def mib(value):
    return f"{(value or 0) / MIB:,.2f} MiB"


def qident(name):
    return '"' + str(name).replace('"', '""') + '"'


def open_readonly(path):
    # Opening through an SQLite read-only URI prevents accidental writes.
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=10)
    db.execute('PRAGMA query_only = ON')
    return db


def row_count(db, table):
    return db.execute(f'SELECT COUNT(*) FROM {qident(table)}').fetchone()[0]


def table_names(db):
    return {
        name: sql or '' for name, sql in db.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='table'"
        )
    }


def size_by_object(db):
    try:
        values = list(db.execute(
            'SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC'
        ))
    except sqlite3.DatabaseError as exc:
        print(f'  dbstat unavailable ({exc}); detailed page attribution omitted')
        return []
    if not values:
        print('  dbstat yielded no objects')
        return []
    print('  TOP SQLITE OBJECTS (physical page usage):')
    for name, nbytes in values[:18]:
        print(f'    {str(name):38.38} {mib(nbytes):>13}   {nbytes:>12,} bytes')
    fts_bytes = sum(n or 0 for name, n in values if name.startswith(('fts_', 'ota_fts_', 'search_fts_')))
    doc_bytes = sum(n or 0 for name, n in values if name in ('doc', 'doc_nt', 'doc_ntu'))
    print(f'  FTS shadow tables total: {mib(fts_bytes)}')
    print(f'  Doc table and indexes: {mib(doc_bytes)}')
    return values


def doc_stats(db, columns):
    if not columns:
        print('  No doc table found')
        return
    print('  DOC STATISTICS:')
    print(f'    documents: {row_count(db, "doc"):,}')
    group_column = 'grp' if 'grp' in columns else ('group' if 'group' in columns else None)
    if group_column:
        print('    by content group:')
        sql = f'SELECT {qident(group_column)}, COUNT(*) FROM doc GROUP BY {qident(group_column)} ORDER BY COUNT(*) DESC'
        for group, count in db.execute(sql):
            print(f'      {str(group):22.22} {count:>9,}')
    body_columns = [x for x in ('title', 'source', 'body', 'bl', 'args', 'route') if x in columns]
    if body_columns:
        totals = ', '.join(f'COALESCE(SUM(LENGTH({qident(c)})),0)' for c in body_columns)
        values = db.execute(f'SELECT {totals} FROM doc').fetchone()
        print('    stored string lengths (UTF-8 bytes estimated separately by hash):')
        for col, val in zip(body_columns, values):
            print(f'      {col:16} {val:>13,} characters')
    if 'body' in columns:
        # Scan the indexed document table only, without loading its full corpus into RAM.
        hashes = Counter()
        total_utf8 = 0
        for (body,) in db.execute('SELECT body FROM doc'):
            if not body:
                continue
            b = body.encode('utf-8') if isinstance(body, str) else bytes(body)
            total_utf8 += len(b)
            hashes[hashlib.blake2b(b, digest_size=16).digest()] += 1
        repeat_groups = sum(n > 1 for n in hashes.values())
        excess_copies = sum(n - 1 for n in hashes.values() if n > 1)
        print(f'    doc.body UTF-8 payload (before SQLite overhead): {mib(total_utf8)}')
        print(f'    repeated exact nonempty body values: {repeat_groups:,} groups; {excess_copies:,} excess copies')


def diagnose(path):
    path = path.expanduser().resolve()
    print('\n' + '=' * 80)
    print(f'DATABASE: {path}')
    if not path.is_file():
        raise FileNotFoundError(f'File not found: {path}')
    print(f'FILE SIZE: {mib(path.stat().st_size)} ({path.stat().st_size:,} bytes)')
    db = open_readonly(path)
    try:
        page_size = db.execute('PRAGMA page_size').fetchone()[0]
        pages = db.execute('PRAGMA page_count').fetchone()[0]
        unused = db.execute('PRAGMA freelist_count').fetchone()[0]
        print(f'PAGES: count={pages:,}, size={page_size:,} bytes, free={unused:,} ({mib(unused * page_size)})')
        names = table_names(db)
        user_tables = [n for n in names if not n.startswith('sqlite_')]
        print(f'TABLES: {", ".join(user_tables[:35])}' + (' ...' if len(user_tables) > 35 else ''))
        columns = {r[1] for r in db.execute('PRAGMA table_info("doc")')} if 'doc' in names else set()
        doc_stats(db, columns)
        size_by_object(db)
    finally:
        db.close()


def main():
    if len(sys.argv) != 3:
        print('Usage: python -X utf8 diagnose_search_sqlite.py OLD.db NEW.db')
        return 2
    old, new = [Path(x) for x in sys.argv[1:]]
    try:
        diagnose(old)
        diagnose(new)
    except (OSError, sqlite3.DatabaseError, ValueError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1
    print('\nDONE. Both databases were opened in READ-ONLY mode; nothing changed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
