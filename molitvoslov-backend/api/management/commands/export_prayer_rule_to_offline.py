"""Safely refresh one offline prayer rule from the active local SQLite database.

Default mode is a read-only preview. --apply updates only prayer_rules.list
and prayer_rules.by_slug[slug], leaving all unrelated offline data untouched.
"""

import hashlib
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection
from django.utils import timezone

from api.models import PrayerRule
from api.serializers import PrayerRuleSerializer


DEFAULT_SLUG = "molitvy-utrennie"


def canonical_json(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        cls=DjangoJSONEncoder,
    )


def update_rule_snapshot(existing, slug, rule_payload):
    """Return a new snapshot without changing the input or unrelated sections."""
    if not isinstance(existing, dict) or existing.get("schema_version") != 1:
        raise CommandError("Unsupported or missing offlineContent.json schema_version.")

    rules = existing.get("prayer_rules")
    if not isinstance(rules, dict):
        raise CommandError("offlineContent.json has no prayer_rules object.")
    by_slug = rules.get("by_slug")
    listing = rules.get("list")
    if not isinstance(by_slug, dict) or not isinstance(listing, list):
        raise CommandError("offlineContent.json has an invalid prayer_rules index.")
    if slug not in by_slug or not isinstance(by_slug[slug], dict):
        raise CommandError(f"Rule {slug!r} not found in bundled by_slug index.")

    list_positions = [
        index for index, item in enumerate(listing)
        if isinstance(item, dict) and item.get("slug") == slug
    ]
    if len(list_positions) != 1:
        raise CommandError(f"Expected one rule {slug!r} in prayer_rules.list; found {len(list_positions)}.")

    old = by_slug[slug]
    old_items = old.get("items")
    new_items = rule_payload.get("items")
    if not isinstance(old_items, list) or not isinstance(new_items, list) or not new_items:
        raise CommandError("Rule items missing in offline JSON or the local Django database.")

    old_ids = {str(item["id"]) for item in old_items if isinstance(item, dict) and "id" in item}
    new_ids = {str(item["id"]) for item in new_items if isinstance(item, dict) and "id" in item}
    if len(new_ids) != len(new_items):
        raise CommandError("The local rule contains missing or duplicate item IDs.")
    removed_ids = sorted(old_ids - new_ids)
    if removed_ids:
        raise CommandError(
            "Refusing to remove existing prayer rule items: " +
            ", ".join(removed_ids) +
            ". Check that manage.py uses the intended SQLite database."
        )

    # The rule contains full, nested TextSerializer objects; updating this
    # single rule is sufficient for PrayerRuleScreen and PrayerRuleReader.
    changed = canonical_json(old) != canonical_json(rule_payload)
    if not changed:
        return existing, sorted(new_ids - old_ids), False

    updated = dict(existing)
    updated_rules = dict(rules)
    updated_list = list(listing)
    updated_list[list_positions[0]] = rule_payload
    updated_index = dict(by_slug)
    updated_index[slug] = rule_payload
    updated_rules["list"] = updated_list
    updated_rules["by_slug"] = updated_index
    updated["prayer_rules"] = updated_rules

    content = {
        key: value for key, value in updated.items()
        if key not in {"schema_version", "content_version", "generated_at"}
    }
    updated["content_version"] = hashlib.sha256(
        canonical_json(content).encode("utf-8")
    ).hexdigest()
    updated["generated_at"] = timezone.now().isoformat()
    return updated, sorted(new_ids - old_ids), True


class Command(BaseCommand):
    help = (
        "Preview or safely export one public prayer rule from local SQLite "
        "into an existing app offlineContent.json. Never modifies the database."
    )

    def add_arguments(self, parser):
        parser.add_argument("--slug", default=DEFAULT_SLUG)
        parser.add_argument(
            "--output",
            default=str(
                settings.BASE_DIR.parent
                / "molitvoslov-app"
                / "src"
                / "data"
                / "offlineContent.json"
            ),
            help="Existing app JSON to update (absolute path recommended).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the JSON with a timestamped backup; without this, preview only.",
        )

    def handle(self, *args, **options):
        if connection.vendor != "sqlite":
            raise CommandError(
                "Refusing to export from a non-SQLite source. "
                "Use the local SQLite-configured Django environment."
            )

        db_path = connection.settings_dict.get("NAME")
        output_path = Path(options["output"]).resolve()
        if not output_path.is_file():
            raise CommandError(f"Target offlineContent.json does not exist: {output_path}")

        slug = options["slug"].strip()
        rule = (
            PrayerRule.objects.filter(slug=slug, is_visible=True)
            .prefetch_related("items__text__categories", "items__footnotes", "footnotes")
            .first()
        )
        if rule is None:
            raise CommandError(f"Visible prayer rule {slug!r} not found in SQLite.")

        rule_payload = json.loads(json.dumps(
            PrayerRuleSerializer(rule).data,
            ensure_ascii=False,
            cls=DjangoJSONEncoder,
        ))
        with output_path.open("r", encoding="utf-8") as handle:
            existing = json.load(handle)

        updated, added_ids, changed = update_rule_snapshot(
            existing, slug, rule_payload
        )
        old_count = len(existing["prayer_rules"]["by_slug"][slug]["items"])
        new_count = len(rule_payload["items"])
        self.stdout.write(f"SQLite: {db_path}")
        self.stdout.write(f"JSON: {output_path}")
        self.stdout.write(f"Rule: {slug}; old items: {old_count}; SQLite items: {new_count}")
        added = [
            item for item in rule_payload["items"]
            if str(item.get("id")) in set(added_ids)
        ]
        for item in added:
            title = (
                (item.get("text") or {}).get("title")
                or item.get("title")
                or (item.get("text") or {}).get("content", "")[:50]
            )
            self.stdout.write(
                f"ADDED item={item['id']} order={item.get('order')} {title}"
            )
        if not changed:
            self.stdout.write("No differences; JSON already contains this rule.")
            return
        if not options["apply"]:
            self.stdout.write(
                "PREVIEW ONLY: no files or database records changed. "
                "Run with --apply to save the updated rule."
            )
            return

        backup = output_path.with_name(
            output_path.name + ".backup-" + datetime.now().strftime("%Y%m%d_%H%M%S")
        )
        shutil.copy2(output_path, backup)
        temp = output_path.with_name(
            "." + output_path.name + f".{os.getpid()}.tmp"
        )
        try:
            with temp.open("w", encoding="utf-8", newline="\n") as handle:
                json.dump(updated, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temp, output_path)
        except Exception as exc:
            temp.unlink(missing_ok=True)
            raise CommandError(
                f"Export failed; original JSON and backup preserved at {backup}: {exc}"
            ) from exc

        self.stdout.write(self.style.SUCCESS(
            f"Updated only {slug!r} in {output_path}; backup: {backup}. "
            "SQLite and all other offline sections were not changed."
        ))
