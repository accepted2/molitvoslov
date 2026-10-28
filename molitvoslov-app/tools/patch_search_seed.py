#!/usr/bin/env python3
"""Add ONLY selected new prayers/akathist to the old prebuilt FTS5 seed.

Run in molitvoslov-app: python tools/patch_search_seed.py
Does not modify the original DB; creates src/data/search_seed_patched.db.
"""
import json, shutil, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_search_seed import fold, compact, KIND_BOOST

SRC = ROOT / 'src/data/search_seed.db'
DEST = ROOT / 'src/data/search_seed_patched.db'
CONTENT = ROOT / 'src/data/offlineContent.json'
BIBLE = ROOT / 'src/data/offlineBible.json'
PRAYERS = {
    'molitva-svyatogo-pravednogo-ioanna-kronshtadtskogo',
    'molitva-inaya-svyatogo-pravednogo-ioanna-kronshtadtskogo',
    'molitva-ko-presvyatoj-troice-svyatogo-pravednogo-ioanna-kronshtadtskogo',
    'molitva-optinskih-starcev',
    'molitva-poslednih-optinskih-starcev',
}

def find_akathist(content):
    found = [(slug, a) for slug, a in content['akathists']['by_slug'].items()
             if 'избавлен' in fold(a.get('title', '')) and 'бед' in fold(a.get('title',''))]
    if len(found) != 1:
        raise RuntimeError('Expected exactly one akathist about Избавление от бед; found: ' + str([x[0] for x in found]))
    return found[0]

def add(db, lang, group, identifier, title, source, texts, route, kind='text', preview='', text_language=None):
    title = compact(title)
    normalized = fold(' '.join(compact(x) for x in texts if x))
    payload = {'id': identifier, 'group': group, 'kind': kind, 'title': title,
               'source': source, 'snippet': compact(preview)[:190], 'route': route,
               'matchedLanguageLabel': '', 'groupLabel': group, 'score': 150,
               'matchedTextLanguage': text_language, 'bodyWordCount': len(normalized.split())}
    existing = db.execute("SELECT rowid,payload FROM search_payloads WHERE language=? AND json_extract(payload,'$.id')=?", (lang,identifier)).fetchall()
    if len(existing) > 1:
        raise RuntimeError('Duplicate existing document ID: '+identifier)
    if existing:
        rowid, old_payload = existing[0]
        old_row = db.execute('SELECT title,source,body FROM search_documents_content WHERE rowid=?', (rowid,)).fetchone()
        if not old_row:
            raise RuntimeError('Missing source content for '+identifier)
        old_kind = json.loads(old_payload)['kind']
        old_index_title = '' if old_kind == 'bible-verse' else fold(old_row[0])
        # External-content FTS5 requires removing tokens BEFORE deleting the source row.
        db.execute("INSERT INTO search_documents(search_documents,rowid,title,source,body) VALUES ('delete',?,?,?,?)",
                   (rowid,old_index_title,fold(old_row[1]),old_row[2]))
        db.execute('DELETE FROM search_documents_content WHERE rowid=?',(rowid,))
        db.execute('DELETE FROM search_payloads WHERE rowid=?',(rowid,))
    else:
        rowid = db.execute('SELECT COALESCE(MAX(rowid),0)+1 FROM search_payloads').fetchone()[0]
    db.execute('INSERT INTO search_documents_content(rowid,title,source,body) VALUES(?,?,?,?)',
               (rowid,title,source,normalized))
    db.execute('INSERT INTO search_documents(rowid,title,source,body) VALUES(?,?,?,?)',
               (rowid,fold(title),fold(source),normalized))
    db.execute('INSERT INTO search_payloads(rowid,language,group_key,kind,boost,payload) VALUES(?,?,?,?,?,?)',
               (rowid,lang,group,kind,KIND_BOOST.get(kind,1.0),json.dumps(payload,ensure_ascii=False,separators=(',',':'))))
    return 'replaced' if existing else 'added'

def main():
    if not SRC.is_file(): raise SystemExit('Missing '+str(SRC))
    if DEST.exists(): raise SystemExit('Output already exists. Move it before running: '+str(DEST))
    content=json.loads(CONTENT.read_text(encoding='utf-8-sig'))
    bible=json.loads(BIBLE.read_text(encoding='utf-8-sig'))
    texts={t.get('slug'):t for t in content['texts'].values()}
    missing=PRAYERS-texts.keys()
    if missing: raise SystemExit('Missing prayers in offlineContent.json: '+repr(missing))
    slug,akathist=find_akathist(content)
    print('Akathist:',slug, '| sections:',len(akathist.get('sections', [])))
    print('Selected prayers:',len(PRAYERS))
    shutil.copy2(SRC,DEST)
    db=sqlite3.connect(DEST)
    try:
        required={'search_documents_content','search_documents','search_payloads','search_metadata'}
        existing={r[0] for r in db.execute('SELECT name FROM sqlite_master')}
        if not required <= existing: raise RuntimeError('Old DB schema is not the expected external-content FTS5 seed')
        results=[]
        with db:
            for lang in ('ru','uk'):
                for prayer_slug in sorted(PRAYERS):
                    t=texts[prayer_slug]
                    title=(t.get('title_uk') if lang=='uk' else t.get('title')) or t.get('title') or t.get('traditional_title') or 'Молитва'
                    cats=t.get('categories') or []
                    cat=next((c for c in cats if isinstance(c,dict) and c.get('slug') and c.get('id')),None)
                    if cat:
                        route={'name':'Book','params':{'categoryId':cat['id'],'categorySlug':cat['slug'],
                            'categoryName':(cat.get('name_uk') if lang=='uk' else cat.get('name')) or cat.get('name') or 'Молитвы',
                            'focusTarget':{'anchor_type':'category_text','text_id':t.get('id'),'start_offset':None,'end_offset':None}}}
                    else:
                        route={'name':'Reader','params':{'slug':prayer_slug}}
                    body=t.get('content') or ''
                    if not body: raise RuntimeError('No church text for '+prayer_slug)
                    # Same canonical result layout as the original prebuilt generator.
                    results.append(add(db,lang,'prayers','text:'+str(t['id']),title,'Молитвы',[body],route,'prayer',body,'church'))
                title=(akathist.get('title_uk') if lang=='uk' else akathist.get('title')) or akathist.get('title') or ''
                params={'slug':akathist.get('slug') or slug,'title':title,'akathistId':akathist.get('id')}
                results.append(add(db,lang,'akathists','akathists:'+str(akathist['id']),title,'akathists',
                    [akathist.get('title'),akathist.get('title_uk'),akathist.get('description'),akathist.get('description_uk')],
                    {'name':'Akathist','params':params},'akathist'))
                for section in akathist.get('sections',[]):
                    st=section.get('text') or {}
                    body=st.get('content')
                    if not body: continue
                    sid=section['id']
                    p={**params,'parentTitle':title,'focusTarget':{'anchor_type':'akathist_section','anchor_id':sid,'start_offset':None,'end_offset':None}}
                    results.append(add(db,lang,'akathists','akathists:section:'+str(sid)+':church',st.get('title') or title,title,
                        [body],{'name':'Akathist','params':p},'akathists-section',body,'church'))
            # The old engine requires version equality. This marker only denotes the
            # selected additions; it does NOT certify all other changed records.
            for lang in ('ru','uk'):
                version='9:'+lang+':'+(content.get('content_version') or content.get('generated_at') or 'bundle-public')+':'+(bible.get('content_version') or bible.get('generated_at') or 'bundle-bible')
                db.execute('UPDATE search_metadata SET version=? WHERE language=?',(version,lang))
        integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
        if integrity!='ok':raise RuntimeError('SQLite integrity check failed: '+integrity)
        cnt=db.execute('SELECT COUNT(*) FROM search_payloads').fetchone()[0]
        print('Added:',results.count('added'),'Replaced:',results.count('replaced'))
        print('Total:',cnt,'SQLite integrity:',integrity)
        print('Patched DB:',DEST,'size MiB:',round(DEST.stat().st_size/1048576,2))
        print('NOTICE: this patch targets ONLY the selected akathist and five prayers; other post-Oct-24 changes are NOT reconciled.')
        print('Use the patched file as src/data/search_seed.db only after checking the resulting content.')
    except:
        db.close()
        DEST.unlink(missing_ok=True)
        raise
    db.close()

if __name__=='__main__': main()
