"""Read-only preflight for a mass calendar-feast transfer to Supabase.

Identify potential duplicate saints/feasts that existing sync_uid/source_id
matching would not discover. Inspect all remote CalendarFeast records and
the actual feast relations for selected year. NEVER write to either DB.
"""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.calendar_models import CalendarDay, CalendarFeast
from api.management.commands.sync_calendar_to_supabase import (
    Command as SyncCommand,
    REMOTE_ALIAS,
)


def canonical_feast_title(value):
    """Normalize common spelling/diacritic/punctuation differences."""
    text = unicodedata.normalize("NFKD", str(value or "")).casefold().replace("ё", "е")
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def feast_names(feast):
    return {
        key for key in (
            canonical_feast_title(feast["title"]),
            canonical_feast_title(feast["short_title"]),
        ) if key
    }


def find_feast_collision_candidates(
    local_feasts, feast_dates, remote_feasts, remote_day_to_feast_ids
):
    """Compare only names of rows sync would CREATE; preserve all evidence.

    Identity keys (sync_uid and source_id) match the actual sync command.
    Same-day equal names warrant high-priority manual review. Global name
    matches without the same date are weaker and do not prove duplicates.
    """
    remote_by_uid = {
        str(row["sync_uid"]): row for row in remote_feasts if row["sync_uid"]
    }
    remote_by_source_id = {
        row["source_id"]: row for row in remote_feasts
        if row["source_id"] is not None
    }
    remote_by_id = {row["id"]: row for row in remote_feasts}
    remote_by_name = defaultdict(list)
    for remote in remote_feasts:
        for name in feast_names(remote):
            remote_by_name[name].append(remote)

    stats = Counter()
    exact_same_day = []
    exact_global = []
    unmatched = []

    for local in local_feasts:
        local_names = feast_names(local)
        if local["sync_uid"] and str(local["sync_uid"]) in remote_by_uid:
            stats["already_matched_by_uid"] += 1
            continue
        if (
            local["source_id"] is not None
            and local["source_id"] in remote_by_source_id
        ):
            stats["already_matched_by_source_id"] += 1
            continue

        stats["would_create"] += 1
        dates = sorted(feast_dates.get(local["id"], ()))
        day_matches = {}
        for target_date in dates:
            for remote_id in remote_day_to_feast_ids.get(target_date, ()):
                remote = remote_by_id.get(remote_id)
                if remote and local_names.intersection(feast_names(remote)):
                    day_matches[remote_id] = remote

        named_matches = {}
        for name in local_names:
            for remote in remote_by_name.get(name, ()):
                named_matches[remote["id"]] = remote

        item = {
            "local_id": local["id"],
            "local_title": local["title"],
            "local_short_title": local["short_title"],
            "local_source_id": local["source_id"],
            "local_sync_uid": str(local["sync_uid"] or ""),
            "local_dates": [day.isoformat() for day in dates],
        }

        def reference(remote):
            return {
                "remote_id": remote["id"],
                "remote_title": remote["title"],
                "remote_short_title": remote["short_title"],
                "remote_source_id": remote["source_id"],
                "remote_sync_uid": str(remote["sync_uid"] or ""),
            }

        if day_matches:
            stats["same_day_exact_name_risks"] += 1
            item["possible_matches"] = [
                reference(remote) for remote in sorted(
                    day_matches.values(), key=lambda value: value["id"]
                )
            ]
            exact_same_day.append(item)
        elif named_matches:
            stats["global_name_matches_review"] += 1
            item["possible_matches"] = [
                reference(remote) for remote in sorted(
                    named_matches.values(), key=lambda value: value["id"]
                )[:12]
            ]
            exact_global.append(item)
        else:
            stats["no_name_match"] += 1
            unmatched.append(item)

    return dict(stats), exact_same_day, exact_global, unmatched


class Command(BaseCommand):
    help = (
        "Только чтение: проверить, являются ли тысячи CalendarFeast CREATE "
        "новыми карточками или возможными дублями существующих памятей Supabase."
    )

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2026)
        parser.add_argument("--report", default="")

    def handle(self, *args, **options):
        year = options["year"]
        if not 2026 <= year <= 2098:
            raise CommandError("Год должен быть в диапазоне 2026–2098.")

        sync = SyncCommand()
        sync._assert_local_source()
        sync._configure_supabase_connection()
        sync._check_remote()
        days = sync._select_days({"year": year, "dates": None, "range": None})
        if not days:
            raise CommandError(f"Нет локальных календарных дней {year} года.")

        local = {}
        feast_dates = defaultdict(set)
        for day in days:
            feasts = list(day.feasts.all())
            if day.main_feast and day.main_feast not in feasts:
                feasts.append(day.main_feast)
            for feast in feasts:
                local[feast.pk] = {
                    "id": feast.pk,
                    "title": feast.title,
                    "short_title": feast.short_title,
                    "source_id": feast.source_id,
                    "sync_uid": feast.sync_uid,
                }
                feast_dates[feast.pk].add(day.date_gregorian)

        # Reading the entire remote feast table is intentional: a potential
        # duplicate may exist globally even if it is not yet linked to this day.
        remote_feasts = list(
            CalendarFeast.objects.using(REMOTE_ALIAS).values(
                "id", "title", "short_title", "source_id", "sync_uid"
            )
        )
        remote_day_to_feast_ids = {}
        remote_days = (
            CalendarDay.objects.using(REMOTE_ALIAS)
            .filter(date_gregorian__year=year)
            .select_related("main_feast")
            .prefetch_related("feasts")
        )
        for day in remote_days:
            linked = {feast.pk for feast in day.feasts.all()}
            if day.main_feast_id:
                linked.add(day.main_feast_id)
            remote_day_to_feast_ids[day.date_gregorian] = sorted(linked)

        stats, same_day, global_matches, unmatched = find_feast_collision_candidates(
            list(local.values()),
            feast_dates,
            remote_feasts,
            remote_day_to_feast_ids,
        )
        output = Path(options["report"] or (
            Path(settings.BASE_DIR) / "reports"
            / f"calendar_feast_sync_preflight_{year}.json"
        )).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "year": year,
            "mode": "READ_ONLY",
            "local_days": len(days),
            "local_linked_unique_feasts": len(local),
            "remote_total_feasts_all_years": len(remote_feasts),
            "remote_days_in_year": len(remote_day_to_feast_ids),
            "summary": stats,
            "same_day_exact_title_risks": same_day,
            "global_title_matches_review": global_matches,
            "no_name_matches": unmatched,
            "note": (
                "Exact titles alone do not prove identity. Same-day matches "
                "must be manually reviewed before full sync. "
                "Different names can still describe the same saint."
            ),
        }
        output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        self.stdout.write(f"Год: {year}; локальных дней {len(days)}, "
                          f"памятей {len(local)}; Supabase памятей {len(remote_feasts)}, "
                          f"дней года {len(remote_day_to_feast_ids)}.")
        self.stdout.write(
            f"Идентифицировано по UUID: {stats.get('already_matched_by_uid', 0)}, "
            f"по source_id: {stats.get('already_matched_by_source_id', 0)}."
        )
        self.stdout.write(
            f"План CREATE: {stats.get('would_create', 0)}; "
            f"совпадений имени в том же дне: "
            f"{stats.get('same_day_exact_name_risks', 0)}; "
            f"совпадений имени только глобально: "
            f"{stats.get('global_name_matches_review', 0)}; "
            f"без совпадений имени: {stats.get('no_name_match', 0)}."
        )
        for entry in same_day[:12]:
            self.stdout.write(
                "  РИСК ДУБЛЯ: "
                + ", ".join(entry["local_dates"][:3])
                + " | " + (entry["local_short_title"] or entry["local_title"])
                + " | remote ID "
                + ", ".join(
                    str(match["remote_id"])
                    for match in entry["possible_matches"]
                )
            )
        self.stdout.write(f"Полный отчёт: {output}")
        self.stdout.write("Только чтение: Supabase и SQLite не изменены.")
