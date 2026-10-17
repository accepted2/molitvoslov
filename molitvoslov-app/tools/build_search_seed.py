#!/usr/bin/env python3
"""Generate a bundled, read-only FTS5 search database before Android/iOS build.

Run from molitvoslov-app: python tools/build_search_seed.py
The generated db is deterministic for the same offline data.
"""
import json
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "search_seed.db"
CONTENT = ROOT / "src" / "data" / "offlineContent.json"
BIBLE = ROOT / "src" / "data" / "offlineBible.json"
SCHEMA = "7"

def fold(value):
    value = unicodedata.normalize("NFD", str(value or "").lower().replace("ё", "е"))
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", value, flags=re.UNICODE)).strip()

def compact(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def main():
    content = json.loads(CONTENT.read_text(encoding="utf-8-sig"))
    bible = json.loads(BIBLE.read_text(encoding="utf-8-sig"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.unlink(missing_ok=True)
    db = sqlite3.connect(OUT)
    db.execute("CREATE VIRTUAL TABLE search_documents USING fts5(normalized, content='', tokenize='unicode61 remove_diacritics 2', detail='full', columnsize=0)")
    db.execute("CREATE TABLE search_payloads (rowid INTEGER PRIMARY KEY, language TEXT NOT NULL, group_key TEXT NOT NULL, payload TEXT NOT NULL)")
    db.execute("CREATE INDEX search_payloads_group ON search_payloads(language, group_key)")
    db.execute("CREATE TABLE search_metadata (language TEXT PRIMARY KEY, version TEXT NOT NULL)")
    count = 0

    def add(lang, group, identifier, title, source, texts, route, kind="text", preview=""):
        nonlocal count
        texts = [compact(x) for x in texts if x]
        title = compact(title)
        if not title and not texts:
            return
        payload = {"id": identifier, "group": group, "kind": kind, "title": title,
                   "source": source, "snippet": compact(preview)[:190],
                   "route": route, "matchedLanguageLabel": "",
                   "groupLabel": group, "score": 150}
        normalized = fold(" ".join([title, source] + texts))
        count += 1
        db.execute("INSERT INTO search_documents(rowid, normalized) VALUES (?, ?)", (count, normalized))
        db.execute("INSERT INTO search_payloads(rowid, language, group_key, payload) VALUES (?, ?, ?, ?)",
                   (count, lang, group, json.dumps(payload, ensure_ascii=False, separators=(",", ":"))))
        if count % 1500 == 0:
            db.commit()

    books = bible.get("books", [])
    text_objs = content.get("texts", {})
    if isinstance(text_objs, dict):
        text_objs = list(text_objs.values())
    for lang in ("ru", "uk"):
        for txt in text_objs:
            if not isinstance(txt, dict):
                continue
            title = txt.get("title_uk") if lang == "uk" else txt.get("title")
            title = title or txt.get("title") or txt.get("traditional_title") or "Молитва"
            texts = [txt.get(k) for k in ("title", "title_uk", "traditional_title", "description", "description_uk",
                     "content", "traditional_content", "translation", "translation_uk")]
            add(lang, "prayers", "text:" + str(txt.get("id")), title, "Молитвы", texts,
                {"name": "Reader", "params": {"slug": txt.get("slug")}}, preview=txt.get("translation") or "")
        for group, key, route_name in (("akathists", "akathists", "Akathist"),
                                        ("canons", "canons", "Canon")):
            items = content.get(key, {}).get("by_slug", {})
            for item in items.values():
                title = (item.get("title_uk") if lang == "uk" else item.get("title")) or item.get("title") or ""
                params = {"slug": item.get("slug"), "title": title}
                params["akathistId" if group == "akathists" else "canonId"] = item.get("id")
                add(lang, group, group + ":" + str(item.get("id")), title, group,
                    [item.get("title"), item.get("title_uk"), item.get("description"), item.get("description_uk")],
                    {"name": route_name, "params": params}, kind=group[:-1])
                for section in item.get("sections", []):
                    st = section.get("text") or {}
                    sid = section.get("id")
                    texts = [st.get(k) for k in ("title", "title_uk", "content", "traditional_content",
                                                 "translation", "translation_uk")]
                    section_params = dict(params)
                    section_params["focusTarget"] = {"anchor_type": "akathist_section" if group == "akathists" else "canon_section",
                                                      "anchor_id": sid, "start_offset": None, "end_offset": None}
                    add(lang, group, group + ":section:" + str(sid), st.get("title") or title,
                        title, texts, {"name": route_name, "params": section_params}, kind=group + "-section")
        for rule in content.get("prayer_rules", {}).get("list", []):
            rule_title = (rule.get("name_uk") if lang == "uk" else rule.get("name")) or rule.get("name") or "Молитвенное правило"
            add(lang, "prayers", f"prayer-rule:{rule.get('id')}", rule_title, "Молитвенное правило",
                [rule.get("name"), rule.get("name_uk"), rule.get("traditional_name"), rule.get("description")],
                {"name": "PrayerRule", "params": {"slug": rule.get("slug")}}, "prayer-rule")
            for item in rule.get("items", []):
                title = item.get("title") or (item.get("text") or {}).get("title") or rule_title
                st = item.get("text") or {}
                values = [item.get("content"), item.get("content_uk"), item.get("note"),
                          st.get("title"), st.get("content"), st.get("traditional_content"),
                          st.get("translation"), st.get("translation_uk")]
                add(lang, "prayers", f"prayer-rule:{rule.get('id')}:item:{item.get('id')}",
                    title, rule_title, values, {"name": "PrayerRule", "params": {
                    "slug": rule.get("slug"), "focusTarget": {
                    "anchor_type": "prayer_rule_item", "anchor_id": item.get("id"),
                    "start_offset": None, "end_offset": None}}}, "prayer")
        for psalter in content.get("psalters", {}).get("list", [])[:1]:
            add(lang, "psalter", f"psalter:{psalter.get('id')}", psalter.get("name") or "Псалтирь",
                "Псалтирь", [psalter.get("description"), psalter.get("prayers_before"),
                psalter.get("prayers_before_russian"), psalter.get("prayers_after"),
                psalter.get("prayers_after_russian")],
                {"name": "Psalter", "params": {}}, "psalter")
        for kathisma in content.get("kathismas", {}).get("by_number", {}).values():
            knum = kathisma.get("number")
            ktitle = kathisma.get("title") or f"Кафизма {knum}"
            base = {"kathismaNumber": knum, "kathismaTitle": ktitle}
            add(lang, "psalter", f"kathisma:{kathisma.get('id') or knum}",
                ktitle, "Псалтирь", [kathisma.get("prayers_after"), kathisma.get("prayers_after_russian")],
                {"name": "Kathisma", "params": base}, "kathisma")
            for psalm in kathisma.get("psalms", []):
                pnum = psalm.get("number")
                ptitle = f"Псалом {pnum}"
                params = dict(base)
                params["focusTarget"] = {"save_type": "psalm", "anchor_type": "psalm",
                                         "anchor_id": psalm.get("id"), "start_offset": None,
                                         "end_offset": None, "metadata": {
                                         "psalm_id": psalm.get("id"), "psalm_number": pnum}}
                add(lang, "psalter", f"psalm:{psalm.get('id')}", ptitle, ktitle,
                    [psalm.get("title_russian"), psalm.get("title_church_slavonic")],
                    {"name": "Kathisma", "params": params}, "psalm")
                for verse in psalm.get("verses", []):
                    vnum = verse.get("number")
                    vparams = dict(base)
                    vparams["focusTarget"] = {"save_type": "fragment", "anchor_type": "psalm_verse",
                        "anchor_id": verse.get("id"), "start_offset": None, "end_offset": None,
                        "metadata": {"psalm_id": psalm.get("id"), "psalm_number": pnum,
                                     "verse_number": vnum}}
                    add(lang, "psalter", f"psalm:{psalm.get('id')}:verse:{verse.get('id')}",
                        f"Псалом {pnum}:{vnum}", ktitle,
                        [verse.get("russian"), verse.get("church_slavonic"),
                         verse.get("church_slavonic_traditional"), verse.get("ukrainian")],
                        {"name": "Kathisma", "params": vparams}, "psalm-verse",
                        verse.get("russian") or verse.get("church_slavonic") or "")
        for book in books:
            book_id = book.get("id")
            display = book.get("name") or book.get("short_name") or "Библия"
            add(lang, "scripture", "bible-book:" + str(book_id), display, "Писание",
                [display, book.get("short_name")],
                {"name": "BibleBook", "params": {"bookId": book_id}}, "bible-book")
            for chapter in book.get("chapters", []):
                number = chapter.get("number")
                chapter_title = f"{display} {number}"
                add(lang, "scripture", f"bible-chapter:{book_id}:{chapter.get('id')}", chapter_title, "Писание",
                    [chapter_title, f"{book.get('short_name') or display} {number}"],
                    {"name": "BibleChapter", "params": {"bookId": book_id, "chapterNumber": number, "resume": False}},
                    "bible-chapter")
                for verse in chapter.get("verses", []):
                    verse_id = verse.get("id")
                    verse_no = verse.get("number")
                    title = f"{display} {number}:{verse_no}"
                    route = {"name": "BibleChapter", "params": {"bookId": book_id,
                         "chapterNumber": number, "resume": False, "focusTarget": {
                         "save_type": "fragment", "anchor_type": "bible_verse", "anchor_id": verse_id,
                         "start_offset": None, "end_offset": None,
                         "metadata": {"book_id": book_id, "book_slug": book.get("slug"),
                         "chapter_number": number, "verse_number": verse_no}}}}
                    add(lang, "scripture", f"bible:{book_id}:{chapter.get('id')}:{verse_id}",
                        title, "Писание", [title, f"{book.get('short_name') or display} {number}:{verse_no}", verse.get("text")],
                        route, "bible-verse", verse.get("text") or "")
        public_ver = content.get("content_version") or content.get("generated_at") or "bundle-public"
        bible_ver = bible.get("content_version") or bible.get("generated_at") or "bundle-bible"
        db.execute("INSERT INTO search_metadata VALUES (?, ?)", (lang, f"{SCHEMA}:{lang}:{public_ver}:{bible_ver}"))
    db.commit()
    print("Records:", count, "FTS5:", OUT)
    print("Integrity:", db.execute("PRAGMA integrity_check").fetchone()[0])
    db.execute("VACUUM")
    db.close()
    print("Final size MiB:", round(OUT.stat().st_size / (1024 * 1024), 2))

if __name__ == "__main__":
    main()
