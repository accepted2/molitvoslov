#!/usr/bin/env python3
"""Replace legacy main_feast only when its identity is confirmed in the same
date's canonical Blagovist all_feasts. All readings, dates and fasts are immutable.

Unmatched liturgical/seasonal main cards remain untouched rather than being
silently replaced with a different saint's name.
"""
from __future__ import annotations
import argparse
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "molitvoslov-app/src/data/calendar"
AUDIT = ROOT / "molitvoslov-app/src/data/calendarMainCardReconciliationAudit.json"
WORDS = re.compile(r"[a-zа-яіїєґ]{3,}", re.IGNORECASE)
COMMON = {"святи", "препо", "апост", "сщмч", "свящ", "мучен", "блаж", "благо",
          "божие", "матер", "икона", "богор", "мощей", "собор", "святы",
          "годов", "памят", "празд", "велик", "чудот"}


def tokens(value):
    source = str(value or "").casefold().replace("ё", "е").replace("і", "и").replace("ї", "и")
    return {word[:5] if len(word) >= 5 else word for word in WORDS.findall(source)}


def rank(old, possible):
    left, right = tokens(old), tokens(possible)
    if not left or not right:
        return 0.0
    shared = left & right
    meaningful = shared - COMMON
    if len(shared) < 2 or not meaningful:
        return 0.0
    shorter = len(shared) / min(len(left), len(right))
    longer = len(shared) / max(len(left), len(right))
    if shorter < 0.61 or longer < 0.32:
        return 0.0
    return 0.55 * shorter + 0.45 * longer


# Two independently checked articles for the same Nicholas of Myra memory.
NICHOLAS_ALIASES = {"blv-839dc39617bdf40503d594dd", "blv-72fd8ac45d16938f68eb7306"}


def choose(old, feasts):
    scored = []
    for feast in feasts:
        sid = str(feast.get("source_id") or "")
        if not sid.startswith("blv-"):
            continue
        value = rank(old.get("title"), feast.get("title"))
        if value:
            scored.append((value, sid, feast))
    scored.sort(key=lambda x: (-x[0], x[1]))
    if not scored or scored[0][0] < 0.58:
        return None
    if len(scored) > 1 and scored[0][0] - scored[1][0] < 0.09:
        if {scored[0][1], scored[1][1]} <= NICHOLAS_ALIASES:
            # Stable canonical choice for the two synonym source articles.
            return next((x[2] for x in scored if x[1] == "blv-72fd8ac45d16938f68eb7306"), scored[0][2])
        return None
    return scored[0][2]


def run(apply):
    months = [DIR / ("%04d-%02d.json" % (year, month))
              for year in (2025, 2026, 2027) for month in range(1, 13)]
    if len(months) != 36 or not all(p.is_file() for p in months):
        raise RuntimeError("Expected all 36 release-only calendar months")
    counts = {"canonical_kept": 0, "legacy_replaced": 0, "legacy_unmatched": 0,
              "missing_main": 0, "by_year": {}}
    unresolved = []
    chosen_examples = []
    for file in months:
        data = json.loads(file.read_text(encoding="utf-8"))
        year = file.stem[:4]
        stats = counts["by_year"].setdefault(year, {"matched": 0, "unmatched": 0})
        changed = False
        for date, entries in data["days"].items():
            ru = entries.get("ru") or entries.get("uk")
            if not ru:
                continue
            main = ru.get("main_feast")
            if not main:
                counts["missing_main"] += 1
                continue
            if str(main.get("source_id") or "").startswith("blv-"):
                counts["canonical_kept"] += 1
                continue
            replacement = choose(main, ru.get("all_feasts") or [])
            if not replacement:
                counts["legacy_unmatched"] += 1
                stats["unmatched"] += 1
                unresolved.append({"date": date, "old_title": main.get("title") or "",
                                   "reason": "no uniquely verified same-saint candidate"})
                continue
            card_id = replacement["source_id"]
            localized = {}
            for lang, payload in entries.items():
                if lang not in ("ru", "uk") or not isinstance(payload, dict):
                    continue
                matched = next((f for f in payload.get("all_feasts", [])
                                if f.get("source_id") == card_id), None)
                if matched is None:
                    localized = {}
                    break
                localized[lang] = matched
            if not localized:
                counts["legacy_unmatched"] += 1
                stats["unmatched"] += 1
                unresolved.append({"date": date, "old_title": main.get("title") or "",
                                   "reason": "localizations do not share the canonical identity"})
                continue
            for lang, matched in localized.items():
                # Deliberately touch only main_feast, preserve every other field.
                entries[lang]["main_feast"] = copy.deepcopy(matched)
            counts["legacy_replaced"] += 1
            stats["matched"] += 1
            changed = True
            if len(chosen_examples) < 50:
                chosen_examples.append({"date": date, "old": main.get("title"),
                                        "new": replacement.get("title"), "id": card_id})
        if apply and changed:
            file.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if apply:
        AUDIT.write_text(json.dumps({"counts": counts, "examples": chosen_examples,
                                     "unresolved": unresolved}, ensure_ascii=False, indent=2)+"\n",
                         encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False), flush=True)
    print("Legacy items without exact matching new feast were preserved:", len(unresolved), flush=True)
    if counts["legacy_replaced"] < 20:
        raise RuntimeError("Unexpectedly few verified replacements")
    if apply:
        for date, expected in [("2026-11-21", "blv-e800801bc36780be611d8945"),
                               ("2026-12-19", "blv-72fd8ac45d16938f68eb7306")]:
            file = DIR / (date[:7] + ".json")
            month = json.loads(file.read_text(encoding="utf-8"))
            actual = month["days"][date]["ru"]["main_feast"]["source_id"]
            if actual != expected:
                raise RuntimeError("Required same-saint reconciliation failed: %s got %s" % (date, actual))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    run(args.apply)
