"""Read-only multiyear verification of one 2026 feast-card observance per ID.

Read-only: never writes SQLite, Supabase or the JSON catalog.
Fetches Azbyka day lists, caches per-day sources and builds evidence for
each local 2026 card; future-year comparisons use stable saint-page URLs,
not arbitrary name matches across different dates.
"""
from __future__ import annotations

import csv
import json
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from api.azbyka_calendar_feasts import (
    AzbykaFeastError,
    DaySaintLink,
    fetch_day_saint_links,
    find_best_source,
)
from api.calendar_engine_v2 import (
    orthodox_pascha,
    julian_month_day,
    year_days,
)
from api.management.commands.generate_calendar_v2 import source_rules_2026

YEARS = (2026, 2027, 2028)
SITE = "https://azbyka.ru/days/{date}"


def as_link(row):
    return DaySaintLink(
        title=row["title"],
        url=row["url"],
        is_multi_link_group=bool(row.get("is_multi_link_group")),
        is_primary=bool(row.get("is_primary")),
    )


def _jdate_rule(day):
    month, day_of_month = julian_month_day(day)
    return {"type": "julian_fixed", "month": month, "day": day_of_month}


def inferred_rule(dates):
    """Conservative: require exactly one matching observed date in every year.

    Returns only rules that agree across all three years. Complex weekdays
    are recorded for review rather than guessed from a single reference year.
    """
    if sorted(d.year for d in dates) != list(YEARS):
        return None
    old_style = {_jdate_rule(d)["month"] * 100 + _jdate_rule(d)["day"] for d in dates}
    if len(old_style) == 1:
        return _jdate_rule(dates[0])
    offsets = {(d - orthodox_pascha(d.year)).days for d in dates}
    if len(offsets) == 1:
        return {"type": "easter_offset", "days": offsets.pop()}
    return None


def _dump_json(path, obj):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _write_csv(path, rows, fields):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


class Command(BaseCommand):
    help = (
        "Массовая проверка правил памятей по страницам Azbyka за 2026–2028: "
        "кэш, источники для каждого ID, отчёт, без изменения БД/JSON."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir", default="reports/calendar_rule_source_audit_2026_2028"
        )
        parser.add_argument(
            "--catalog",
            default="molitvoslov_calendar_database_v4_AUDITED.json",
            help="JSON-каталог для сопоставления с предлагаемыми правилами; "
                 "если файла нет, онлайн-сверка проводится без него.",
        )
        parser.add_argument(
            "--delay", type=float, default=0.5,
            help="Минимальная пауза между запросами Azbyka (0.5 сек).",
        )
        parser.add_argument("--timeout", type=float, default=25)
        parser.add_argument(
            "--max-new-pages", type=int, default=0,
            help="Для пробного запуска; 0 означает все отсутствующие страницы.",
        )

    def handle(self, *args, **opts):
        if connections["default"].vendor != "sqlite":
            raise CommandError("Аудит разрешён только с локальной SQLite.")

        output = Path(opts["output_dir"])
        if not output.is_absolute():
            output = Path(settings.BASE_DIR) / output
        output.mkdir(parents=True, exist_ok=True)

        source = source_rules_2026()
        catalog_path = Path(opts["catalog"])
        if not catalog_path.is_absolute():
            catalog_path = Path(settings.BASE_DIR) / catalog_path
        catalog_rules = {}
        if catalog_path.exists():
            try:
                raw = json.loads(catalog_path.read_text(encoding="utf-8-sig"))
                catalog_rules = {
                    int(item["local_id"]): item.get("date_rule")
                    for item in raw["feasts"].values()
                    if isinstance(item.get("local_id"), int)
                }
                if len(catalog_rules) != len(raw["feasts"]):
                    raise ValueError(
                        "Неуникальные / отсутствующие local_id в справочнике."
                    )
            except (KeyError, TypeError, ValueError, OSError) as e:
                raise CommandError(f"Некорректный JSON-каталог: {e}") from e
            self.stdout.write(
                f"Каталог: {len(catalog_rules)} правил из {catalog_path}"
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"Каталог {catalog_path} не найден: сравнение с JSON пропущено."
                )
            )
        self.stdout.write(f"Эталон локальной SQLite: {len(source)} привязок за 2026 год.")

        session = requests.Session()
        session.headers.update({"User-Agent": "Molitvoslov-calendar-audit/1.0"})
        cached, fetched, errors = 0, 0, []
        snapshots = {}
        max_new = max(0, opts["max_new_pages"])
        try:
            for year in YEARS:
                for day in year_days(year):
                    day_str = str(day)
                    cache = output / "cache" / str(year) / f"{day_str}.json"
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    if cache.exists():
                        try:
                            data = json.loads(cache.read_text(encoding="utf-8"))
                            if data.get("date") != day_str or not data.get("sources"):
                                raise ValueError("неполный кэш")
                            snapshots[day] = [as_link(x) for x in data["sources"]]
                            cached += 1
                            continue
                        except (OSError, ValueError, KeyError, TypeError):
                            self.stderr.write(f"Кэш повреждён, повторим запрос: {day_str}")
                    if max_new and fetched >= max_new:
                        continue
                    try:
                        links = fetch_day_saint_links(
                            day, session=session,
                            timeout=max(5.0, opts["timeout"])
                        )
                        if not links:
                            raise ValueError("список памятей пуст")
                        rows = [{
                            "url": x.url,
                            "title": x.title,
                            "is_primary": x.is_primary,
                            "is_multi_link_group": x.is_multi_link_group,
                        } for x in links]
                        _dump_json(cache, {
                            "date": day_str, "source_url": SITE.format(date=day_str),
                            "sources": rows,
                        })
                        snapshots[day] = links
                        fetched += 1
                        if fetched % 25 == 0:
                            self.stdout.write(
                                f"Скачано {fetched}, из кэша {cached}, "
                                f"последняя дата {day_str}"
                            )
                        time.sleep(max(0.5, opts["delay"]))
                    except (requests.RequestException, AzbykaFeastError, ValueError, OSError) as e:
                        errors.append({
                            "date": day_str, "url": SITE.format(date=day_str),
                            "error": str(e)[:500],
                        })
                        self.stderr.write(f"Ошибка {day_str}: {e}")
                        # Missing pages remain uncached and will be retried next run.
        finally:
            session.close()

        all_days = sum(len(list(year_days(y))) for y in YEARS)
        complete = len(snapshots) == all_days
        self.stdout.write(
            f"Источники: страниц {len(snapshots)}/{all_days}; "
            f"новых {fetched}, из кэша {cached}, ошибок {len(errors)}."
        )
        _write_csv(output / "fetch_errors.csv", errors, ["date", "url", "error"])
        if not complete:
            _dump_json(output / "fetch_progress.json", {
                "cached_or_fetched": len(snapshots), "expected": all_days,
                "newly_fetched": fetched, "errors": len(errors),
                "complete": False, "db_changed": False,
            })
            self.stdout.write(
                "ПРОМЕЖУТОЧНО: не все дни загружены. Повторный запуск "
                "продолжит с кэша. Правила пока не классифицируются."
            )
            return

        # Future occurrences: stable Azbyka saint URL -> dates, per year.
        seen_url = defaultdict(lambda: defaultdict(set))
        for d, links in snapshots.items():
            for link in links:
                seen_url[link.url][d.year].add(d)

        # 2026 source record -> Azbyka permalink by strong, unique title match.
        matched_by_2026_url = defaultdict(list)
        matches = {}
        for memory in source:
            links = snapshots[memory.source_date]
            match = find_best_source(memory.title, links, threshold=0.84, margin=0.13)
            if match.source is None:
                matches[memory.id] = (None, match.score, match.reason)
            else:
                matches[memory.id] = (match.source.url, match.score, "")
                matched_by_2026_url[(memory.source_date, match.source.url)].append(
                    memory.id
                )

        rows, proposals, stats = [], {}, Counter()
        for memory in source:
            url, score, match_error = matches[memory.id]
            observed = {year: sorted(seen_url[url][year]) if url else []
                        for year in YEARS}
            status, suggestion = "", None

            if url is None:
                status = "NO_UNIQUE_TITLE_MATCH"
            elif len(matched_by_2026_url[(memory.source_date, url)]) != 1:
                status = "SOURCE_URL_COLLISION_2026"
            elif observed[2026] != [memory.source_date]:
                status = "MULTIPLE_OBSERVANCES_2026"
            elif any(len(observed[y]) != 1 for y in YEARS[1:]):
                status = "MISSING_OR_MULTIPLE_OBSERVANCES"
            else:
                dates = [observed[y][0] for y in YEARS]
                suggestion = inferred_rule(dates)
                status = ("SOURCE_RULE_CONFIRMED" if suggestion is not None
                          else "COMPLEX_WEEKDAY_OR_EXCEPTION")
                if suggestion is not None:
                    if memory.id in catalog_rules:
                        status = (
                            "RULE_CONFIRMED" if catalog_rules[memory.id] == suggestion
                            else "CATALOG_RULE_DIFFERS"
                        )
                    proposals[str(memory.id)] = {
                        "title": memory.title,
                        "previous_catalog_rule": catalog_rules.get(memory.id),
                        "rule": suggestion,
                        "evidence": [
                            {"date": str(d), "day_url": SITE.format(date=str(d)),
                             "saint_url": url} for d in dates
                        ],
                        "note": (
                            "Согласованные календарные даты трёх лет; не "
                            "проверены уставные переносы и годы за пределами выборки."
                        ),
                    }
            stats[status] += 1
            rows.append({
                "local_id": memory.id,
                "title": memory.title,
                "source_2026": str(memory.source_date),
                "status": status,
                "match_score": f"{score:.3f}",
                "source_saint_url": url or "",
                "2026_observed": ",".join(map(str, observed[2026])),
                "2027_observed": ",".join(map(str, observed[2027])),
                "2028_observed": ",".join(map(str, observed[2028])),
                "proposed_rule": json.dumps(suggestion, ensure_ascii=False)
                if suggestion else "",
                "catalog_rule": (
                    json.dumps(catalog_rules.get(memory.id), ensure_ascii=False)
                    if memory.id in catalog_rules else ""
                ),
                "match_note": match_error,
            })

        _write_csv(
            output / "all_3056_rules.csv", rows, [
                "local_id", "title", "source_2026", "status", "match_score",
                "source_saint_url", "2026_observed", "2027_observed",
                "2028_observed", "proposed_rule", "catalog_rule", "match_note",
            ]
        )
        _write_csv(
            output / "needs_review.csv",
            [x for x in rows if x["status"] not in (
                "RULE_CONFIRMED", "SOURCE_RULE_CONFIRMED"
            )],
            [
                "local_id", "title", "source_2026", "status", "match_score",
                "source_saint_url", "2026_observed", "2027_observed",
                "2028_observed", "proposed_rule", "catalog_rule", "match_note",
            ]
        )
        _dump_json(output / "rule_proposals.json", {
            "purpose": "Proposals only; read-only evidence, NOT auto-approved for production",
            "source": "https://azbyka.ru/days/YYYY-MM-DD",
            "years_checked": list(YEARS),
            "matched": proposals,
        })
        leap = date(2028, 3, 13)
        _dump_json(output / "leap_2028_julian_feb29.json", {
            "gregorian": str(leap), "julian": "2028-02-29",
            "source_url": SITE.format(date=str(leap)),
            "azbyka_day_titles": [x.title for x in snapshots[leap]],
            "note": "2026 contains no Julian Feb 29 source cards.",
        })
        _dump_json(output / "summary.json", {
            "checked_cards": len(source),
            "years": list(YEARS), "source_pages": all_days,
            "status": dict(stats),
            "proposals": len(proposals),
            "json_rules_loaded": len(catalog_rules),
            "rules_to_correct": stats["CATALOG_RULE_DIFFERS"],
            "sqlite_changed": False, "supabase_changed": False,
            "catalog_changed": False,
        })
        self.stdout.write(
            self.style.SUCCESS(
                f"ГОТОВО, БЕЗ ЗАПИСИ: {len(source)} карточек, "
                f"предложений {len(proposals)}, категории {dict(stats)}. "
                f"Отчёт: {output}"
            )
        )
