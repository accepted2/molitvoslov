#!/usr/bin/env python3
"""Build v10 from the project's real offline JSON, reusing the existing v9 corpus traversal.
This avoids changing or rewriting the canonical extraction rules. Existing v9 script remains untouched.
Run from app root: python tools/build_search_seed_v10.py
"""
import importlib.util
import json
import textwrap
from pathlib import Path
from search_seed_lib import SeedWriter, merge_languages, KIND_BOOST

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / 'tools' / 'build_search_seed.py'
DEST = ROOT / 'src' / 'data' / 'search_seed_v10.db'


def main():
    source = ORIGINAL.read_text(encoding='utf-8-sig')
    start_tag = '    # Feast-level calendar texts:'
    end_tag = '        public_ver = content.get('
    if source.count(start_tag) != 1 or source.count(end_tag) != 1:
        raise RuntimeError('v9 corpus traversal has changed; refuse to silently omit documents')
    body = source.split(start_tag, 1)[1].split(end_tag, 1)[0]
    body = textwrap.dedent(start_tag + body)
    # The original extraction loop is executed with the same Python globals it expects.
    # Only add() changes: it accumulates documents instead of writing to the v9 database.
    spec = importlib.util.spec_from_file_location('molitvoslov_original_seed', ORIGINAL)
    old = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    content_path = ROOT / 'src/data/offlineContent.json'
    bible_path = ROOT / 'src/data/offlineBible.json'
    content = json.loads(content_path.read_text(encoding='utf-8-sig'))
    bible = json.loads(bible_path.read_text(encoding='utf-8-sig'))
    collected = {'ru': [], 'uk': []}

    def add(lang, group, identifier, title, source, texts, route, kind='text', preview='', text_language=None):
        variants = []
        code = {'church': 'c', 'russian': 'r', 'ukrainian': 'u'}.get(text_language, 'm')
        for t in texts:
            if t:
                original = old.compact(t)
                if original:
                    variants.append((code, original))
        title = old.compact(title)
        if not title and not variants:
            return
        collected[lang].append({
            'ext': str(identifier), 'grp': str(group), 'kind': str(kind),
            'title': title, 'source': str(source or ''), 'route': route,
            'variants': variants, 'boost': KIND_BOOST.get(kind, 1.0),
        })

    ns = dict(vars(old))
    ns.update({'ROOT': ROOT, 'content': content, 'bible': bible, 'add': add})
    exec(compile(body, str(ORIGINAL) + ':extraction', 'exec'), ns, ns)
    merged = merge_languages(collected)
    writer = SeedWriter()
    for doc in merged:
        writer.add(doc)
    stats = writer.finish(DEST, {
        'public_content_version': str(content.get('content_version', '')),
        'bible_content_version': str(bible.get('content_version', '')),
        'generator': 'v10-from-original-corpus',
    })
    if stats['integrity'] != 'ok':
        raise RuntimeError('Generated database integrity_check failed')
    print('V10 GENERATED:', json.dumps(stats, ensure_ascii=False, indent=2))
    print('Original records: ru=%d uk=%d, merged=%d' % (len(collected['ru']), len(collected['uk']), len(merged)))
    print('Output:', DEST)


if __name__ == '__main__':
    main()
