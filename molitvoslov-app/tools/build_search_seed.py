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
SCHEMA = "8"
KIND_BOOST = {"psalm-verse":1.20,"bible-verse":1.15,"psalm":1.10,"text":1.10,"prayer":1.10,"bible-chapter":1.0,"akathist":1.0,"canon":1.0,"psalter":1.0,"akathist-section":0.95,"canon-section":0.95,"prayer-rule":0.90,"kathisma":0.90,"bible-book":0.90}

def fold(value):
    # Normalize Slavonic letters to modern Russian spelling so Russian-keyboard
    # queries match the canonical Church Slavonic text.
    value = str(value or "").lower().replace("ё", "е")
    value = value.translate(str.maketrans({
        "ѣ": "е", "і": "и", "ѳ": "ф", "ѵ": "и", "ѡ": "о",
        "ѧ": "я", "ѫ": "у", "ѕ": "з", "ѯ": "кс", "ѱ": "пс",
        "ѻ": "о", "ѿ": "от", "ꙋ": "у", "ѹ": "у",
    }))
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"\s+", " ", "".join(ch if ch.isalnum() else " " for ch in value)).strip()
    return re.sub(r"ъ(?=\s|$)", "", value)

def compact(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def generic_prayer(title):
    return fold(title) in {"молитва", "молитвы", "молитви"}

def meaningful_prayer(title, body):
    return not generic_prayer(title) or len(fold(body).split()) >= 40

def main():
    content = json.loads(CONTENT.read_text(encoding="utf-8-sig"))
    bible = json.loads(BIBLE.read_text(encoding="utf-8-sig"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.unlink(missing_ok=True)
    db = sqlite3.connect(OUT)
    # Оригинальный текст (для snippet()) — обычная таблица.
    db.execute("""CREATE TABLE search_documents_content (
                                                            rowid INTEGER PRIMARY KEY,
                                                            title TEXT,
                                                            source TEXT,
                                                            body TEXT
                  )""")
    # FTS5 с внешним контентом (content='search_documents_content') —
    # snippet() работает, читает текст из search_documents_content.
    db.execute("""CREATE VIRTUAL TABLE search_documents USING fts5(
        title, source, body,
        content='search_documents_content',
        tokenize='unicode61 remove_diacritics 2',
        detail='full',
        columnsize=0
    )""")
    db.execute("CREATE TABLE search_payloads (rowid INTEGER PRIMARY KEY, language TEXT NOT NULL, group_key TEXT NOT NULL, kind TEXT NOT NULL, boost REAL NOT NULL DEFAULT 1.0, payload TEXT NOT NULL)")
    db.execute("CREATE INDEX search_payloads_group ON search_payloads(language, group_key)")
    db.execute("CREATE TABLE search_metadata (language TEXT PRIMARY KEY, version TEXT NOT NULL)")
    count = 0

    def add(lang, group, identifier, title, source, texts, route, kind="text", preview="", text_language=None):
        nonlocal count
        texts = [compact(x) for x in texts if x]
        title = compact(title)
        if not title and not texts:
            return
        payload = {"id": identifier, "group": group, "kind": kind, "title": title,
                   "source": source, "snippet": compact(preview)[:190],
                   "route": route, "matchedLanguageLabel": "",
                   "groupLabel": group, "score": 150, "matchedTextLanguage": text_language,
                   "bodyWordCount": len(fold(" ".join(texts)).split())}
        normalized = fold(" ".join(texts))
        count += 1
        # Оригинал (для snippet()) — в search_documents_content.
        db.execute("INSERT INTO search_documents_content(rowid, title, source, body) VALUES (?, ?, ?, ?)",
                   (count, title, source, normalized))
        # Нормализованный (для поиска) — в FTS5.
        db.execute("INSERT INTO search_documents(rowid, title, source, body) VALUES (?, ?, ?, ?)",
                   (count, fold(title), fold(source), normalized))
        db.execute("INSERT INTO search_payloads(rowid, language, group_key, kind, boost, payload) VALUES (?, ?, ?, ?, ?, ?)",
                   (count, lang, group, kind, KIND_BOOST.get(kind, 1.0), json.dumps(payload, ensure_ascii=False, separators=(",", ":"))))
        if count % 1500 == 0:
            db.commit()

    books = bible.get("books", [])
    category_data = content.get("categories") or {}
    if isinstance(category_data, list):
        category_list = category_data
    elif isinstance(category_data, dict):
        category_list = category_data.get("list") or category_data.get("items") or list(category_data.values())
    else:
        category_list = []
    category_by_id = {
        str(category["id"]): category
        for category in category_list
        if isinstance(category, dict) and category.get("id")
    }
    text_objs = content.get("texts", {})
    if isinstance(text_objs, dict):
        text_objs = list(text_objs.values())
    for lang in ("ru", "uk"):
        # Collect canonical prayers before indexing. A titled prayer gets a single
        # result even if copied into several categories or multiple prayer rules.
        prayer_candidates = {}
        def queue_prayer(title, identifier, route, variants, source, priority):
            candidates = [(language, compact(body)) for language, body in variants
                          if language == "church" and body and meaningful_prayer(title, body)]
            if not candidates:
                return
            church_text = candidates[0][1]
            # A prayer is identified by its actual Slavonic text, not its label.
            # Do not collapse distinct prayers merely because both say "Молитва".
            key = fold(church_text)
            candidate = (priority, title, identifier, route, candidates, source)
            current = prayer_candidates.get(key)
            if current is None or priority < current[0]:
                prayer_candidates[key] = candidate

        for txt in text_objs:
            if not isinstance(txt, dict):
                continue
            title = txt.get("title_uk") if lang == "uk" else txt.get("title")
            title = title or txt.get("title") or txt.get("traditional_title") or "Молитва"
            categories = []
            for raw_category in txt.get("categories") or []:
                if isinstance(raw_category, dict):
                    resolved = category_by_id.get(str(raw_category.get("id")), raw_category)
                    if not resolved.get("slug") and raw_category.get("slug"):
                        resolved = raw_category
                else:
                    resolved = category_by_id.get(str(raw_category))
                if isinstance(resolved, dict) and resolved.get("id") and resolved.get("slug"):
                    categories.append(resolved)
            category = categories[0] if categories else None
            if category:
                route = {"name": "Book", "params": {
                    "categoryId": category["id"], "categorySlug": category["slug"],
                    "categoryName": (category.get("name_uk") if lang == "uk" else category.get("name"))
                                    or category.get("name") or "Молитвы",
                    "focusTarget": {"anchor_type": "category_text",
                                    "text_id": txt.get("id"),
                                    "start_offset": None, "end_offset": None}}}
            else:
                route = {"name": "Reader", "params": {"slug": txt.get("slug")}}
            # Standalone Reader snippets have no source section to navigate to.
            if not category:
                continue
            queue_prayer(title, "text:" + str(txt.get("id")), route, (
                ("church", txt.get("content")), ("russian", txt.get("translation")),
                ("ukrainian", txt.get("translation_uk")),
                ("traditional", txt.get("traditional_content"))),
                "Молитвы", 30 if category else 50)
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
                    section_params = dict(params)
                    section_params["focusTarget"] = {
                        "anchor_type": "akathist_section" if group == "akathists" else "canon_section",
                        "anchor_id": sid, "start_offset": None, "end_offset": None}
                    for text_language, field in (("church", "content"), ("russian", "translation"),
                                                 ("ukrainian", "translation_uk"),
                                                 ("traditional", "traditional_content")):
                        body = st.get(field)
                        if not body:
                            continue
                        add(lang, group, group + ":section:" + str(sid) + ":" + text_language,
                            st.get("title") or title, title, [body],
                            {"name": route_name, "params": section_params}, kind=group + "-section",
                            preview=body, text_language=text_language)
        for rule in content.get("prayer_rules", {}).get("list", []):
            rule_title = (rule.get("name_uk") if lang == "uk" else rule.get("name")) or rule.get("name") or "Молитвенное правило"
            add(lang, "prayers", f"prayer-rule:{rule.get('id')}", rule_title, "Молитвенное правило",
                [rule.get("name"), rule.get("name_uk"), rule.get("traditional_name"), rule.get("description")],
                {"name": "PrayerRule", "params": {"slug": rule.get("slug")}}, "prayer-rule")
            for item in rule.get("items", []):
                st = item.get("text") or {}
                # Never invent an item title from its parent prayer-rule name.
                title = item.get("title") or st.get("title")
                if not title:
                    continue
                # Section captions and instructions are not independent prayers.
                lowered_title = fold(title)
                known_short_prayers = {
                    "отче наш", "молитва мытаря", "богородице дево радуйся",
                    "царю небесный", "достойно есть", "символ веры",
                }
                church_body = st.get("content") or item.get("content") or ""
                if (lowered_title.startswith("ясть человече") or
                    (not ("молитв" in lowered_title or
                          lowered_title in known_short_prayers) and
                     len(fold(church_body).split()) < 40)):
                    continue
                route = {"name": "PrayerRule", "params": {
                    "slug": rule.get("slug"), "focusTarget": {
                        "anchor_type": "prayer_rule_item", "anchor_id": item.get("id"),
                        "start_offset": None, "end_offset": None}}}
                priority = 0 if "utren" in str(rule.get("slug") or "").lower() else 10
                queue_prayer(title,
                    f"prayer-rule:{rule.get('id')}:item:{item.get('id')}",
                    route, (("church", st.get("content") or item.get("content")),
                            ("russian", st.get("translation")),
                            ("ukrainian", st.get("translation_uk") or item.get("content_uk")),
                            ("traditional", st.get("traditional_content"))),
                    rule_title, priority)

        for priority, title, identifier, route, variants, source in prayer_candidates.values():
            # One index row per prayer; search all available translations while
            # opening the canonical text in the Church Slavonic reader mode.
            chosen = next(((language, body) for language, body in variants
                           if language == "church"), variants[0])
            add(lang, "prayers", identifier, title, source,
                [chosen[1]], route, kind="prayer",
                preview=chosen[1], text_language="church")
        for psalter in content.get("psalters", {}).get("list", [])[:1]:
            add(lang, "psalter", f"psalter:{psalter.get('id')}", psalter.get("name") or "Псалтирь",
                "Псалтирь", [psalter.get("description"), psalter.get("prayers_before"),
                             psalter.get("prayers_before_russian"), psalter.get("prayers_after"),
                             psalter.get("prayers_after_russian")],
                {"name": "Psalter", "params": {}}, "psalter",
                preview=psalter.get("description") or psalter.get("prayers_before") or psalter.get("prayers_after") or "")
        for kathisma in content.get("kathismas", {}).get("by_number", {}).values():
            knum = kathisma.get("number")
            ktitle = kathisma.get("title") or f"Кафизма {knum}"
            base = {"kathismaNumber": knum, "kathismaTitle": ktitle}
            add(lang, "psalter", f"kathisma:{kathisma.get('id') or knum}",
                ktitle, "Псалтирь", [kathisma.get("prayers_after"), kathisma.get("prayers_after_russian")],
                {"name": "Kathisma", "params": base}, "kathisma",
                preview=kathisma.get("prayers_after") or kathisma.get("prayers_after_russian") or "")
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
                    for text_language, field in (
                        ("church", "church_slavonic"),
                        ("russian", "russian"),
                        ("ukrainian", "ukrainian"),
                        ("traditional", "church_slavonic_traditional")):
                        body = verse.get(field)
                        if not body:
                            continue
                        add(lang, "psalter",
                            f"psalm:{psalm.get('id')}:verse:{verse.get('id')}:{text_language}",
                            f"Псалом {pnum}:{vnum}", ktitle, [body],
                            {"name": "Kathisma", "params": vparams}, "psalm-verse",
                            preview=body, text_language=text_language)
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
                        title, "Писание", [verse.get("text")],
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