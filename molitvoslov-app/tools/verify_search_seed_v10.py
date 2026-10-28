#!/usr/bin/env python3
"""Validate v10 bundle and source versions; does not mutate any files."""
import json
import sqlite3
import sys
from pathlib import Path
from search_seed_lib import SCHEMA, stems
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'src/data/search_seed_v10.db'
CONTENT=ROOT/'src/data/offlineContent.json'
BIBLE=ROOT/'src/data/offlineBible.json'
def main():
    if not P.exists(): raise RuntimeError('Missing v10 prebuilt seed: '+str(P))
    db=sqlite3.connect(f'file:{P.resolve().as_posix()}?mode=ro', uri=True)
    try:
        meta=dict(db.execute('SELECT k,v FROM meta'))
        if meta.get('schema')!=SCHEMA: raise RuntimeError('Schema mismatch')
        for k,file in [('public_content_version',CONTENT),('bible_content_version',BIBLE)]:
            current=json.loads(file.read_text(encoding='utf-8-sig')).get('content_version','')
            if meta.get(k)!=current: raise RuntimeError(f'Stale seed {k}: stored {meta.get(k)} vs current {current}')
        count=db.execute('SELECT COUNT(*) FROM doc').fetchone()[0]
        if count<1000: raise RuntimeError('Too few documents: '+str(count))
        if db.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise RuntimeError('Corrupt database')
        for phrase in ('отче наш','богородица','господи помилуй'):
            query=' AND '.join('"'+w+'"' for w in stems(phrase))
            n=db.execute('SELECT COUNT(*) FROM fts WHERE fts MATCH ?', (query,)).fetchone()[0]
            print(phrase, n)
            if n<1: raise RuntimeError('No matches for '+phrase)
        print(f'VERIFIED schema={SCHEMA} docs={count} sizeMiB={P.stat().st_size/1048576:.2f}')
    finally: db.close()
if __name__=='__main__':
    try: main()
    except Exception as e: sys.exit('INVALID SEARCH SEED: '+str(e))
