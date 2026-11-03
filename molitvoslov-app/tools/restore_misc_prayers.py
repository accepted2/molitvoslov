#!/usr/bin/env python3
"""Restore five verified published prayers from a captured Supabase snapshot.

Read-only by default. --apply modifies only local Django api_text and
api_categorytext, after a consistent SQLite backup. Existing content is
never overwritten. Does NOT contact remote services, remove placeholders,
or touch user-owned app data.
"""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3
import sys


APP = Path(__file__).resolve().parents[1]
BACKEND = Path(r"C:\m\repo\molitvoslov-backend")
FIXTURE = APP / "tools" / "recovery_data" / "misc_prayers_20261103.json"
BACKUPS = APP.parent / "build-backups"
CATEGORY_SLUG = "raznye-molitvy"
TEXT_FIELDS = (
    "slug", "title", "title_uk", "traditional_title", "content",
    "traditional_content", "translation", "translation_uk",
    "description", "description_uk", "description_position",
    "language", "is_visible",
)
IDENTITY_FIELDS = ("slug", "title", "content", "language", "is_visible")


def load_snapshot():
    data = json.loads(FIXTURE.read_text(encoding="utf-8-sig"))
    rows = data.get("prayers")
    expected = data.get("expected_slugs")
    if (
        data.get("category_slug") != CATEGORY_SLUG
        or not isinstance(rows, list)
        or len(rows) != 5
        or not isinstance(expected, list)
        or len(expected) != 5
        or len(set(expected)) != 5
        or {row.get("slug") for row in rows} != set(expected)
    ):
        raise RuntimeError("Unexpected recovery snapshot identities")
    for item in rows:
        if (
            item.get("category_slug") != CATEGORY_SLUG
            or item.get("is_visible") is not True
            or len(item.get("content", "")) < 100
            or any(field not in item for field in TEXT_FIELDS)
        ):
            raise RuntimeError("Incomplete prayer: " + str(item.get("slug")))
    return rows


def validate_offline_snapshot(payload):
    """Block APK exports if any restored prayer or category link disappears."""
    prayers = load_snapshot()
    catalog = payload.get("texts") or {}
    category_rows = (payload.get("category_texts") or {}).get(CATEGORY_SLUG) or []
    links = {
        ((item.get("text") or {}).get("slug"))
        for item in category_rows
        if isinstance(item, dict) and isinstance(item.get("text"), dict)
    }
    missing_catalog = [p["slug"] for p in prayers if p["slug"] not in catalog]
    missing_links = [p["slug"] for p in prayers if p["slug"] not in links]
    empty = [p["slug"] for p in prayers
             if p["slug"] in catalog and not str(catalog[p["slug"]].get("content") or "").strip()]
    if missing_catalog or missing_links or empty:
        raise RuntimeError(
            "APK MISC PRAYERS INCOMPLETE. Restore five prayers in local Django first. "
            "Missing texts: " + str(missing_catalog) +
            "; missing category links: " + str(missing_links) +
            "; empty content: " + str(empty)
        )
    print("RECOVERED MISC PRAYERS VERIFIED: 5 published texts and 5 category links")


def ensure_local_database():
    if not (BACKEND / "manage.py").is_file():
        raise RuntimeError("Expected local Django backend missing: " + str(BACKEND))
    sys.path.insert(0, str(BACKEND))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    os.chdir(BACKEND)
    import django
    django.setup()
    from django.db import connection
    connection.ensure_connection()
    db = Path(str(connection.settings_dict["NAME"])).resolve()
    expected = (BACKEND / "db.sqlite3").resolve()
    if connection.vendor != "sqlite" or db != expected or not db.is_file():
        raise RuntimeError("Refusing to modify an unexpected database: " + str(db))
    return db


def check_existing(text, original):
    if text is None:
        return
    differences = [
        field for field in IDENTITY_FIELDS
        if getattr(text, field) != original[field]
    ]
    # A different entry under the same slug must not be silently overwritten.
    if differences:
        raise RuntimeError(
            "EXISTING PRAYER CONFLICT, refusing overwrite: " +
            original["slug"] + " fields: " + ", ".join(differences)
        )


def verify_restored(rows, category):
    from api.models import Text, CategoryText
    for original in rows:
        text = Text.objects.get(slug=original["slug"])
        check_existing(text, original)
        if not CategoryText.objects.filter(category=category, text=text).exists():
            raise RuntimeError("Missing category link after restoration: " + text.slug)
    print("RESTORED AND LINKED: 5 prayers to " + CATEGORY_SLUG)


def consistent_backup(db):
    BACKUPS.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    dest = BACKUPS / ("django-before-five-misc-prayers-" + timestamp + ".sqlite3")
    with sqlite3.connect(str(db)) as source, sqlite3.connect(str(dest)) as target:
        source.backup(target)
    with sqlite3.connect(str(dest)) as verify:
        integrity = verify.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        dest.unlink(missing_ok=True)
        raise RuntimeError("SQLite backup failed integrity check: " + str(integrity))
    print("LOCAL DJANGO BACKUP:", dest)
    return dest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply", action="store_true",
        help="Create missing public prayers and links in local Django after backup",
    )
    args = parser.parse_args()
    prayers = load_snapshot()
    db = ensure_local_database()
    from django.db import transaction
    from api.models import Category, CategoryText, Text
    category = Category.objects.get(slug=CATEGORY_SLUG)

    actions = []
    for item in prayers:
        existing = Text.objects.filter(slug=item["slug"]).first()
        check_existing(existing, item)
        linked = (
            existing is not None
            and CategoryText.objects.filter(category=category, text=existing).exists()
        )
        state = "ALREADY LINKED" if linked else (
            "CREATE CATEGORY LINK" if existing else "CREATE PRAYER AND LINK"
        )
        actions.append((item, state))
        print(state + ": " + item["title"] + " (" + item["slug"] + ")")

    if not args.apply:
        print("DRY-RUN COMPLETE: no data was changed")
        return
    if all(state == "ALREADY LINKED" for _item, state in actions):
        verify_restored(prayers, category)
        print("NO CHANGES: local SQLite already contains the five prayers")
        return

    consistent_backup(db)

    # Add missing public records only; don't touch categories/other prayers.
    with transaction.atomic():
        for item, _state in actions:
            text = Text.objects.filter(slug=item["slug"]).first()
            check_existing(text, item)
            if text is None:
                text = Text.objects.create(
                    **{field: item[field] for field in TEXT_FIELDS}
                )
            if not CategoryText.objects.filter(category=category, text=text).exists():
                CategoryText.objects.create(
                    category=category,
                    text=text,
                    order=int(item.get("category_order") or 0),
                )
        verify_restored(prayers, category)
    print("LOCAL MISC PRAYERS RESTORE SUCCESS")
    print("NEXT: run tools/promote_local_django_offline.py to package them in APK JSON")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("LOCAL MISC PRAYERS RESTORE FAILED:", exc, file=sys.stderr)
        sys.exit(1)
