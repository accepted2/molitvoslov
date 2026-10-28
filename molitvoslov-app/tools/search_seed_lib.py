"""Общий код для встроенной поисковой базы Молитвослова (схема 10).

* clean/tokens/stem — ДОЛЖНЫ совпадать с src/services/search/normalize.js
  (это проверяет tests/search/search.test.mjs по golden-файлу).
* SeedWriter — пишет компактную базу: каждый текст хранится один раз,
  маршруты — шаблоны + аргументы, feast-объекты календаря — один раз.
"""
import hashlib
import json
import re
import sqlite3
import unicodedata
from pathlib import Path

SCHEMA = "10"
SEP = "\u001f"                      # разделитель вариантов текста в doc.body
LANG_NAMES = {"c": "church", "r": "russian", "u": "ukrainian", "m": None}

KIND_BOOST = {"psalm-verse": 1.20, "bible-verse": 1.15, "psalm": 1.10, "text": 1.10, "prayer": 1.10,
              "bible-chapter": 1.0, "akathist": 1.0, "canon": 1.0, "psalter": 1.0,
              "akathist-section": 0.95, "canon-section": 0.95, "prayer-rule": 0.90,
              "kathisma": 0.90, "bible-book": 0.90}
NO_TITLE_INDEX = {"bible-verse"}              # название стиха не должно находить «все стихи книги»
NO_TITLE_LOOKUP = {"bible-verse", "psalm-verse"}  # для них не строим индекс точного названия

# ───────────── Нормализация и стемминг (зеркало normalize.js) ─────────────
_LEGACY = str.maketrans({
    "ѣ": "е", "і": "и", "ї": "и", "ѳ": "ф", "ѵ": "и", "ѡ": "о", "ѻ": "о", "ѧ": "я", "ѩ": "я",
    "ѹ": "у", "ꙋ": "у", "ѥ": "е", "ѕ": "з", "ѯ": "кс", "ѱ": "пс", "ѿ": "от", "ѫ": "у", "ѭ": "ю",
    "ꙗ": "я", "ё": "е",
})
_WORD = re.compile(r"[^\W_]+")


def clean(text):
    s = unicodedata.normalize("NFD", str(text or "").lower())
    # убираем ударения, титла и прочие надстрочные знаки; краткую (й) сохраняем
    s = "".join(c for c in s if c == "\u0306" or unicodedata.category(c) not in ("Mn", "Me"))
    return unicodedata.normalize("NFC", s).translate(_LEGACY)


def tokens(text):
    out = []
    for w in _WORD.findall(clean(text)):
        if w.endswith("ъ"):
            w = w[:-1]
        if w:
            out.append(w)
    return out


_SUFFIXES = sorted(set([
    "ившись", "ывшись", "ающий", "ующий", "ающ", "яющ", "ующ", "ейш",
    "ость", "ости", "остию", "ение", "ения", "ению", "ением", "ении",
    "ание", "ания", "анию", "анием", "ании", "иями", "ями", "ами",
    "ого", "его", "аго", "яго", "ому", "ему", "ыми", "ими", "ией",
    "ться", "ется", "ится", "ются", "ятся", "атся", "ует", "уют", "ает", "яет", "ают", "яют",
    "ить", "ать", "ять", "еть", "ешь", "ишь", "ете", "ите",
    "ех", "ах", "ях", "ов", "ев", "ам", "ям", "ем", "им", "ом", "ей", "ий", "ый", "ой",
    "ая", "яя", "ое", "ее", "ые", "ие", "ых", "их", "ую", "юю", "ою", "ею", "ия", "ии",
    "ью", "ся", "сь", "ь", "а", "я", "о", "е", "у", "ю", "ы", "и", "й",
]), key=lambda s: (-len(s), s))


def stem(w):
    if len(w) <= 3 or w.isdigit():
        return w
    for s in _SUFFIXES:
        if len(w) - len(s) >= 3 and w.endswith(s):
            return w[: -len(s)]
    return w


def stems(text):
    return [stem(t) for t in tokens(text)]


def fold(text):
    """Нормализованный текст без стемминга (для точных названий)."""
    return " ".join(tokens(text))


def compact(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_placeholder(text):
    t = compact(text)
    return len(t) < 140 and bool(re.search(r"будет\s+добавлен", t, re.I))


# ───────────── Шаблоны маршрутов ─────────────
def _leaves(obj, path=()):
    if isinstance(obj, dict) and obj:
        for k, v in obj.items():
            yield from _leaves(v, path + (k,))
    else:
        yield path, obj


def _setpath(root, path, value):
    if not path:
        return value
    cur = root
    for k in path[:-1]:
        cur = cur.setdefault(k, {})
    cur[path[-1]] = value
    return root


def _dumps(v):
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def decode_route(name, tpl, variables, args):
    """Python-версия декодера (JS-версия — routes.js). Нужна для тестов."""
    params = json.loads(tpl)
    for path, value in zip(variables, args):
        params = _setpath(params, tuple(path), value)
    return {"name": name, "params": params}


def fingerprint(docs):
    """Отпечаток ТОЛЬКО того, что участвует в поиске/открытии результата."""
    h = hashlib.sha256()
    for d in sorted(docs, key=lambda d: (d["ext"], d["lang"])):
        h.update(json.dumps([d["ext"], d["lang"], d["grp"], d["kind"], d["title"], d.get("title_uk"),
                             d["source"], d["route"], d["variants"], d.get("boost", 1.0)],
                            ensure_ascii=False, sort_keys=True).encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def same_payload(a, b):
    keys = ("grp", "kind", "source", "route", "variants", "boost")
    return all(json.dumps(a.get(k), sort_keys=True, ensure_ascii=False) ==
               json.dumps(b.get(k), sort_keys=True, ensure_ascii=False) for k in keys)


def merge_languages(by_lang):
    """ru/uk версии одного текста → одна запись, если они совпадают (кроме названия)."""
    ru = {d["ext"]: d for d in by_lang.get("ru", [])}
    uk = {d["ext"]: d for d in by_lang.get("uk", [])}
    out = []
    for ext in list(ru) + [e for e in uk if e not in ru]:
        a, b = ru.get(ext), uk.get(ext)
        if a and b and same_payload(a, b):
            d = dict(a)
            d["lang"] = ""
            d["title_uk"] = b["title"] if b["title"] != a["title"] else None
            out.append(d)
        else:
            for lang, d in (("ru", a), ("uk", b)):
                if d:
                    d = dict(d)
                    d["lang"] = lang
                    d["title_uk"] = None
                    out.append(d)
    return out


DDL = """
CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE src(id INTEGER PRIMARY KEY, text TEXT NOT NULL);
CREATE TABLE tpl(id INTEGER PRIMARY KEY, name TEXT NOT NULL, tpl TEXT NOT NULL, vars TEXT NOT NULL);
CREATE TABLE feast(id INTEGER PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE doc(
  id INTEGER PRIMARY KEY, ext TEXT NOT NULL, lang TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, title_uk TEXT,
  nt TEXT, ntu TEXT, src INTEGER, srctxt TEXT, tpl INTEGER, args TEXT, fid INTEGER,
  body TEXT NOT NULL DEFAULT '', bl TEXT NOT NULL DEFAULT '', wc INTEGER NOT NULL DEFAULT 0,
  boost REAL NOT NULL DEFAULT 1.0);
CREATE INDEX doc_nt ON doc(nt) WHERE nt IS NOT NULL;
CREATE INDEX doc_ntu ON doc(ntu) WHERE ntu IS NOT NULL;
CREATE VIRTUAL TABLE fts USING fts5(title, source, body, content='',
  tokenize='unicode61 remove_diacritics 0', detail='full');
CREATE VIRTUAL TABLE fts_v USING fts5vocab(fts, 'row');
"""


class SeedWriter:
    def __init__(self):
        self.docs = []

    def add(self, doc):
        self.docs.append(doc)

    def finish(self, path, meta_extra=None):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.unlink(missing_ok=True)
        docs = self.docs

        # 1. feast-объекты — один раз; из маршрута убираем
        feasts, routes = {}, []
        for d in docs:
            params = dict(d["route"].get("params") or {})
            feast = params.pop("feast", None)
            fid = None
            if feast is not None:
                blob = json.dumps(feast, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                fid = feasts.setdefault(blob, len(feasts) + 1)
            routes.append((d["route"]["name"], params, fid))

        # 2. шаблоны: постоянные части маршрута хранятся один раз на (kind, имя, структуру)
        groups = {}
        for i, (name, params, _) in enumerate(routes):
            leaves = list(_leaves(params))
            sig = (docs[i]["kind"], name, tuple(p for p, _ in leaves))
            groups.setdefault(sig, []).append((i, leaves))
        tpl_rows, doc_tpl = [], {}
        for sig, rows in groups.items():
            paths = sig[2]
            seen = {p: set() for p in paths}
            for _, leaves in rows:
                for p, v in leaves:
                    seen[p].add(_dumps(v))
            variable = [p for p in paths if len(seen[p]) > 1]
            first = dict(rows[0][1])
            tpl_obj = {}
            for p in paths:
                tpl_obj = _setpath(tpl_obj, p, None if p in variable else first[p])
            tid = len(tpl_rows) + 1
            tpl_rows.append((tid, sig[1], _dumps(tpl_obj), _dumps([list(p) for p in variable])))
            for i, leaves in rows:
                lv = dict(leaves)
                doc_tpl[i] = (tid, _dumps([lv[p] for p in variable]) if variable else None)

        # 3. запись
        db = sqlite3.connect(path)
        db.executescript(DDL)
        srcs = {}
        db.executemany("INSERT INTO tpl VALUES (?,?,?,?)", tpl_rows)
        db.executemany("INSERT INTO feast VALUES (?,?)", [(fid, blob) for blob, fid in feasts.items()])
        for i, d in enumerate(docs):
            did = i + 1
            variants = [(c, t) for c, t in d["variants"] if t]
            body = SEP.join(t for _, t in variants)
            bl = "".join(c for c, _ in variants)
            wc = max([len(tokens(t)) for _, t in variants] or [0])
            source = d["source"] or ""
            sid = srcs.setdefault(source, len(srcs) + 1) if source else None
            title_uk = d.get("title_uk")
            lookup = d["kind"] not in NO_TITLE_LOOKUP
            tid, args = doc_tpl[i]
            db.execute("INSERT INTO doc VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                did, d["ext"], d["lang"], d["grp"], d["kind"], d["title"], title_uk,
                fold(d["title"]) if lookup and d["title"] else None,
                fold(title_uk) if lookup and title_uk else None,
                sid, None, tid, args, routes[i][2], body, bl, wc, d.get("boost", 1.0)))
            title_idx = "" if d["kind"] in NO_TITLE_INDEX else " ".join(stems(d["title"]) + stems(title_uk))
            body_idx = " zzsep ".join(" ".join(stems(t)) for _, t in variants)
            db.execute("INSERT INTO fts(rowid,title,source,body) VALUES (?,?,?,?)",
                       (did, title_idx, " ".join(stems(source)), body_idx))
        db.executemany("INSERT INTO src VALUES (?,?)", [(i, t) for t, i in srcs.items()])
        meta = {"schema": SCHEMA, "fingerprint": fingerprint(docs), "docs": str(len(docs))}
        meta.update(meta_extra or {})
        db.executemany("INSERT INTO meta VALUES (?,?)", list(meta.items()))
        db.commit()
        db.execute("INSERT INTO fts(fts) VALUES('optimize')")
        db.commit()
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        db.execute("VACUUM")
        db.close()
        return {"docs": len(docs), "templates": len(tpl_rows), "feasts": len(feasts),
                "integrity": integrity, "bytes": path.stat().st_size, "fingerprint": meta["fingerprint"]}
