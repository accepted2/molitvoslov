#!/usr/bin/env python3
"""Patch an extracted Molitvoslov compact-search upgrade package safely.
Usage: python patch_compact_search_candidate.py EXTRACTED_PACKAGE_DIRECTORY
Does not modify the installed app or its search database.
"""
from pathlib import Path
import sys

def replace_once(path, old, new, label):
    source = path.read_text(encoding="utf-8")
    if new in source:
        print("ALREADY PATCHED:", label)
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 anchor, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")
    print("PATCHED:", label)

def patch(root):
    builder = root / "tools/build_search_seed.py"
    writer = root / "tools/search_seed_lib.py"
    engine = root / "src/services/search/engine.js"
    for file in (builder, writer, engine):
        if not file.is_file():
            raise FileNotFoundError(file)

    replace_once(builder,
        '        life_code = "u" if lang == "uk" else "r"',
        '''        # Shared RU lives in UK calendar fallbacks must be merged into one document.
        russian_lives = {
            (k, L.fold(title), L.fold(text))
            for k, _label, title, text, *_ in calendar_entries["ru"]
            if k == "calendar-life"
        }''',
        "deduplicate RU/UK calendar lives")

    replace_once(builder,
        '            code = life_code if kind == "calendar-life" else "c"',
        '''            if kind == "calendar-life":
                code = ("r" if lang == "ru" or
                        (kind, L.fold(entity), L.fold(body)) in russian_lives
                        else "u")
            else:
                code = "c"''',
        "keep genuinely Ukrainian calendar variants")

    replace_once(writer,
        '            body = SEP.join(t for _, t in variants)',
        '''            # Calendar text is already in feast JSON and FTS; do not
            # keep an extra full copy in the document payload.
            body = ("" if d["grp"] == "calendar" and routes[i][2] is not None
                    else SEP.join(t for _, t in variants))''',
        "store calendar full text once")

    anchor = "const SEED = {name: 'seed', doc: 'doc', fts: 'fts', vocab: 'fts_v', extra: ''};"
    helper = '''

// Calendar source text remains indexed by FTS, but stored only in feast.json.
// Reconstruct it lazily for ranking and matched snippets.
const compactCalendarText = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
const calendarBodyFromFeast = (row, feast) => {
  if (!feast || row.grp !== 'calendar' || !row.kind?.startsWith('calendar-')) return '';
  const kind = row.kind.slice('calendar-'.length);
  if (!['life', 'troparion', 'kontakion'].includes(kind)) return '';
  const text = compactCalendarText(feast[kind + '_content']);
  const metadata = compactCalendarText([feast.short_title, feast[kind + '_title']].filter(Boolean).join(' '));
  return (row.bl || '').split('').map((code) => code === 'm' ? metadata : text).join(SEP);
};
const restoreCalendarBodies = async (db, candidates) => {
  const needed = candidates.filter((c) => c.src.name === 'seed' && c.row.grp === 'calendar' &&
    !c.row.body && c.row.fid != null);
  if (!needed.length) return;
  const feasts = await loadFeasts(db, needed.map((c) => c.row.fid));
  needed.forEach((c) => {
    c.row.body = calendarBodyFromFeast(c.row, feasts.get(c.row.fid));
  });
};
'''
    replace_once(engine, anchor, anchor + helper, "calendar body reconstruction")
    replace_once(engine,
        '''  cands.sort((a, b) => PRIORITY[a.via] - PRIORITY[b.via] || a.r * a.row.boost - b.r * b.row.boost);
  const scored = cands.map((c, i) => {''',
        '''  cands.sort((a, b) => PRIORITY[a.via] - PRIORITY[b.via] || a.r * a.row.boost - b.r * b.row.boost);
  await restoreCalendarBodies(db, cands.slice(0, ANALYZE_BUDGET));
  const scored = cands.map((c, i) => {''',
        "calendar ranking from full feast text")
    replace_once(engine,
        '''    const row = p.c.row;
    const texts = row.body ? row.body.split(SEP) : [];''',
        '''    const row = p.c.row;
    if (p.c.src.name === 'seed' && row.grp === 'calendar' && !row.body && row.fid != null) {
      row.body = calendarBodyFromFeast(row, feasts.get(row.fid));
    }
    const texts = row.body ? row.body.split(SEP) : [];''',
        "calendar snippet from full feast text")

    pytests = root / "tools/test_search_seed.py"
    if pytests.is_file():
        anchor = "    def test_build_is_deterministic(self):"
        case = '''    def test_identical_ru_uk_calendar_lives_are_one_document(self):
        content, bible, calendar = fixture()
        day = calendar['days']['2026-12-19']
        day['uk']['main_feast'] = dict(day['ru']['main_feast'])
        with tempfile.TemporaryDirectory() as tmp:
            cal_dir = Path(tmp)
            (cal_dir / '2026-12.json').write_text(
                json.dumps(calendar, ensure_ascii=False), encoding='utf8')
            docs = B.extract_documents(content, bible, cal_dir)
        lives = [doc for doc in docs if doc['kind'] == 'calendar-life']
        self.assertEqual(len(lives), 1)
        self.assertEqual(lives[0]['lang'], '')
        self.assertEqual(lives[0]['variants'][0][0], 'r')

'''
        replace_once(pytests, anchor, case + anchor, "RU/UK calendar merge regression test")

    tests = root / "tests/search/search.test.mjs"
    if tests.is_file():
        anchor = "  it('Ukrainian user sees Ukrainian title when present', async () => {"
        case = '''  it('calendar FTS text is recovered from feast JSON for snippets', async () => {
    const row = await db.getFirstAsync("SELECT body, fid FROM doc WHERE kind='calendar-life' AND lang='ru' LIMIT 1");
    assert.equal(row.body, '');
    assert.ok(row.fid != null);
    const found = await ru('родился в Патарах', 'calendar', 20, 0, db);
    const life = found.items.find((item) => item.kind === 'calendar-life');
    assert.ok(life);
    assert.match(life.snippet, /родился/i);
    assert.match(life.snippet, /Патарах/i);
  });

'''
        replace_once(tests, anchor, case + anchor, "calendar snippet regression test")

    print("PATCH COMPLETE. App and current SQLite untouched.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python patch_compact_search_candidate.py EXTRACTED_PACKAGE_DIR")
    patch(Path(sys.argv[1]).resolve())
