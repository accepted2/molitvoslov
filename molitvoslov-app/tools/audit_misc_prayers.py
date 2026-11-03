#!/usr/bin/env python3
"""Read-only audit of the 'Разные молитвы' catalog across APK JSON, backups and Django.

Never overwrites any data, or opens the phone's personal database.
Run from the app root: python -X utf8 tools/audit_misc_prayers.py
"""
from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
import subprocess
import sys

APP = Path(__file__).resolve().parents[1]
BACKUPS = APP.parent / "build-backups"
BACKEND = Path(r"C:\m\repo\molitvoslov-backend")
PYTHON = BACKEND / "venv" / "Scripts" / "python.exe"
CURRENT = APP / "src" / "data" / "offlineContent.json"
ROOT = "raznye-molitvy"
TARGETS = (ROOT, "molitvy-pered-evangeliem")
PLACEHOLDER = ("будет добавлен позже", "placeholder")


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        print("SKIP JSON:", path.name, str(exc)[:140])
        return None


def category_rows(payload):
    data = payload.get("category_texts") or {}
    result = {}
    for category in TARGETS:
        rows = []
        for row in data.get(category, []):
            text = row.get("text") or {}
            if not isinstance(text, dict):
                continue
            slug = str(text.get("slug") or "")
            title = str(text.get("title") or "")
            body = str(text.get("content") or "")
            placeholder = any(word in slug.lower() or word in body.lower() for word in PLACEHOLDER)
            rows.append({"slug": slug, "title": title, "placeholder": placeholder})
        result[category] = rows
    return result


def show(label, payload):
    rows = category_rows(payload)
    print("\n===", label, "===")
    print("Generated:", payload.get("generated_at"))
    print("Total published texts:", len(payload.get("texts", {})))
    for key in TARGETS:
        items = rows[key]
        real = [i for i in items if not i["placeholder"]]
        print(key, "total", len(items), "real", len(real), "placeholders", len(items) - len(real))
        for i in items[:50]:
            print("  ", "PLACEHOLDER" if i["placeholder"] else "REAL", i["slug"], "|", i["title"])
    return rows


def django_rows():
    if not PYTHON.is_file() or not (BACKEND / "manage.py").is_file():
        print("\nLocal Django unavailable at", BACKEND)
        return None
    snippet = """
import json
from django.db import connection
from api.models import Category, CategoryText, Text
slugs = ['raznye-molitvy', 'molitvy-pered-evangeliem']
result = {'db': str(connection.settings_dict['NAME']),
    'total_published_texts': Text.objects.filter(is_visible=True).count(),
    'categories': list(Category.objects.filter(slug__in=slugs).values('slug','id','parent_id')),
    'rows': list(CategoryText.objects.filter(category__slug__in=slugs)
        .order_by('category__slug','order','id')
        .values('category__slug','text__slug','text__title','text__is_visible'))}
print('MISC_DJANGO_AUDIT=' + json.dumps(result, ensure_ascii=False))
"""
    result = subprocess.run(
        [str(PYTHON), "-X", "utf8", str(BACKEND / "manage.py"),
         "shell", "-c", snippet],
        cwd=BACKEND, text=True, encoding="utf-8", errors="replace",
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    if result.returncode:
        print("Django audit failed:", result.stderr[-800:])
        return None
    for line in result.stdout.splitlines():
        if "MISC_DJANGO_AUDIT=" in line:
            return json.loads(line.split("MISC_DJANGO_AUDIT=", 1)[1])
    print("Django audit output not found:", result.stdout[-450:])
    return None


def snapshots():
    if not BACKUPS.is_dir():
        return []
    paths = []
    for path in BACKUPS.glob("*.json"):
        if "offline" in path.name.lower() and path.is_file():
            paths.append(path)
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)[:100]


def main():
    if not CURRENT.is_file():
        raise SystemExit("Missing " + str(CURRENT))
    data = load(CURRENT)
    if data is None:
        raise SystemExit("Current offline JSON cannot be read")
    current = show("Current local APK offline JSON", data)
    richer = []
    print("\nChecking recent read-only backup candidates...")
    for backup in snapshots():
        old = load(backup)
        if not isinstance(old, dict):
            continue
        rows = category_rows(old)
        difference = []
        for slug in TARGETS:
            current_slugs = {item["slug"] for item in current[slug]}
            difference.extend((slug, item["slug"], item["title"]) for item in rows[slug]
                              if item["slug"] not in current_slugs and not item["placeholder"])
        if difference:
            richer.append((backup, difference))
    print("Backup JSON files with additional real linked prayers:", len(richer))
    for path, missing in richer[:10]:
        print("  ", path, "-", len(missing), "additional")
        for slug, key, title in missing[:8]:
            print("    ", slug, key, title)

    live = django_rows()
    if live:
        print("\n=== Current local Django source (read-only) ===")
        print("DB:", live["db"], "; published texts:", live["total_published_texts"])
        for slug in TARGETS:
            rows = [x for x in live["rows"] if x["category__slug"] == slug]
            current_slugs = {x["slug"] for x in current[slug]}
            print(slug, "linked:", len(rows),
                  "missing in APK:", len([r for r in rows if r["text__slug"] not in current_slugs]))
            for item in rows[:80]:
                marker = "MISSING IN APK" if item["text__slug"] not in current_slugs else "OK"
                print("  ", marker, item["text__slug"], "|", item["text__title"])

    print("\nMISC_PRAYERS_AUDIT_COMPLETE (read-only)")


if __name__ == "__main__":
    main()
