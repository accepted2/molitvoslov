"""Create a full annual calendar from THAT year's source day lists.

Match saints via their recurring source URLs, not inferred 2026 dates.
2026 SQLite cards retain their lives/icons. Any unrecognised source
observance becomes its own card (never someone else's biography).
Local SQLite only; transactional write with backup. 2026 untouched.
"""
from __future__ import annotations
import json
import time
import uuid
from collections import defaultdict
from pathlib import Path

import requests
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.azbyka_calendar_feasts import fetch_day_saint_links, fetch_saint_content
from api.calendar_engine_v2 import calculate_fasting, julian_month_day, orthodox_pascha, year_days
from api.calendar_models import CalendarDay, CalendarFeast, CalendarFastType
from api.calendar_source_matching import match, normalize_title
from api.management.commands.import_azbyka_calendar_fasts import fetch_calendar, fast_period_name

NAMESPACE = uuid.UUID("1c0d29fe-3c47-445b-9a70-867bbc2396ec")


def read_cache(path, day):
    if not path.exists():
        return None
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        if obj.get("date") != day.isoformat():
            return None
        rows = obj.get("sources")
        if not isinstance(rows, list) or not rows:
            return None
        if any(
            not item.get("title") or
            not item.get("url", "").startswith("https://azbyka.ru/days/")
            for item in rows
        ):
            return None
        return rows
    except (ValueError, OSError, KeyError, TypeError):
        return None


def index_source(reference, reference_pages, target_pages):
    """Map individual yearly observances onto the canonical 2026 card IDs."""
    by_url = defaultdict(list)
    base_mismatches = []
    for day, original in reference:
        day_key = day.isoformat()
        site = reference_pages[day_key]
        pairings = match(
            [x["title"] for x in original],
            [x["title"] for x in site],
            [x.get("short_title") or "" for x in original],
        )
        linked = set()
        for i, j, score in pairings:
            if score < 45:
                base_mismatches.append({
                    "date": day_key, "local_id": original[i]["id"],
                    "title": original[i]["title"], "site": site[j]["title"],
                    "similarity": round(score, 1),
                })
                continue
            linked.add(j)
            x = site[j]
            by_url[x["url"]].append({
                "date": day_key, "title": x["title"], "local_id": original[i]["id"],
            })
        for j, item in enumerate(site):
            if j not in linked:
                by_url[item["url"]].append({
                    "date": day_key, "title": item["title"], "local_id": None,
                })

    wanted = defaultdict(list)
    for day_key, site in target_pages.items():
        for i, item in enumerate(site):
            wanted[item["url"]].append((day_key, i, item))

    target = defaultdict(list)
    missing = 0
    for url, site in wanted.items():
        base = by_url.get(url, [])
        paired = (
            match([x["title"] for x in base], [x[2]["title"] for x in site])
            if base else []
        )
        used = set()
        for i, j, score in paired:
            if score < 45:
                continue
            used.add(j)
            day_key, _, item = site[j]
            ancestor = base[i]
            target[day_key].append({
                "local_id": ancestor["local_id"],
                "identity": (
                    f"azbyka:{ancestor['date']}:{url}:"
                    f"{normalize_title(ancestor['title'])}"
                ),
                "source": item,
            })
        for j, (day_key, _, item) in enumerate(site):
            if j in used:
                continue
            missing += 1
            target[day_key].append({
                "local_id": None,
                "identity": (
                    f"azbyka:new:{day_key}:{url}:"
                    f"{normalize_title(item['title'])}"
                ),
                "source": item,
            })

    for day_key, site in target_pages.items():
        ordering = {
            (x["url"], x["title"]): i for i, x in enumerate(site)
        }
        target[day_key].sort(key=lambda x: ordering[
            (x["source"]["url"], x["source"]["title"])
        ])
    return target, base_mismatches, missing


def rank_title(title, celebration_type=""):
    value = normalize_title(title)
    # A pre/afterfeast must not beat a full Twelve Great Feast.
    if any(x in value for x in ("попразднство", "предпразднство", "отдание")):
        return 100
    if "светлое христово воскресение" in value or value == "пасха":
        return 2000
    if any(x in value for x in (
        "рождество христово", "богоявление господне", "крещение господне",
        "сретение господне", "благовещение пресвятой",
        "преображение господне", "успение пресвятой",
        "воздвижение честного", "вознесение господне",
        "пятидесятница", "вход господень в иерусалим",
        "рождество пресвятой", "введение во храм",
    )):
        return 1500
    if "покров пресвятой богородицы" in value:
        return 1250
    if celebration_type in ("great", "great_feast", "pascha"):
        return 1150
    return 0


def main_observance(items, feast_lookup, reference_main):
    """Visible main feast: Pascha > Twelve > Great > source primary > 2026."""
    candidates = []
    for i, item in enumerate(items):
        feast = feast_lookup.get(item["local_id"])
        title = feast.title if feast else item["source"]["title"]
        kind = feast.celebration_type if feast else ""
        candidates.append((
            rank_title(title, kind),
            int(bool(item["source"].get("is_primary"))),
            int(bool(feast and feast.pk in reference_main)),
            -i, item,
        ))
    return max(candidates, key=lambda x: x[:4])[-1] if candidates else None


def fasting(day, marker, known_types):
    is_fasting = "post" in marker.get("classes", [])
    basic = calculate_fasting(day)
    is_cheese = is_fasting and basic.status == "cheese"
    code = "cheese" if is_cheese else ("no-fast" if not is_fasting else "")
    fast_name = fast_period_name(day) if is_fasting else ""
    if is_fasting and not fast_name:
        fast_name = "Однодневный пост"
    return {
        "fast_type": known_types.get(code),
        "fast_type_code": code,
        "fast_type_title": (
            "Сырная седмица" if is_cheese else
            "Постный день" if is_fasting else "Поста нет"
        ),
        "fast_name": fast_name,
        "fast_description": "",
    }


class Command(BaseCommand):
    help = (
        "Сформировать календарь года из опубликованных в этом году "
        "памятей Azbyka; автоматически сопоставить карточки, посты, "
        "не менять 2026 и Supabase."
    )

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)
        modes = parser.add_mutually_exclusive_group(required=True)
        modes.add_argument("--dry-run", action="store_true")
        modes.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--with-readings", action="store_true",
            help="После генерации импортировать опубликованные чтения",
        )
        parser.add_argument("--delay", type=float, default=0.5)
        parser.add_argument(
            "--replace-existing", action="store_true",
            help="Явно разрешить замену уже заполненного года (включая его чтения)",
        )
        parser.add_argument(
            "--skip-new-card-content", action="store_true",
            help="Не загружать жития, тропари, иконы для новых карточек",
        )

    def handle(self, *args, **opts):
        year = opts["year"]
        if not 2027 <= year <= 2098:
            raise CommandError("Разрешены 2027–2098; исходный 2026 неизменен.")
        if connections["default"].vendor != "sqlite":
            raise CommandError("Разрешена только локальная SQLite, не Supabase.")

        existing_days = list(
            CalendarDay.objects.filter(date_gregorian__year=year)
            .prefetch_related("feasts")
        )
        if existing_days and not opts["replace_existing"]:
            raise CommandError(
                f"{year} уже имеет {len(existing_days)} дней. "
                "Нельзя перезаписывать ручные изменения без --replace-existing."
            )

        base_days = list(
            CalendarDay.objects.filter(date_gregorian__year=2026)
            .prefetch_related("feasts").order_by("date_gregorian")
        )
        if len(base_days) != 365:
            raise CommandError("Нет полного эталона SQLite за 2026 год.")
        reference = [
            (
                item.date_gregorian,
                [
                    {
                        "id": feast.pk,
                        "title": feast.title,
                        "short_title": feast.short_title,
                    }
                    for feast in item.feasts.all()
                ],
            )
            for item in base_days
        ]
        reference_main = {
            item.main_feast_id for item in base_days if item.main_feast_id
        }
        feast_ids = {
            feast["id"] for _, items in reference for feast in items
        }
        local = {
            feast.pk: feast
            for feast in CalendarFeast.objects.filter(pk__in=feast_ids)
        }
        root = (
            Path(settings.BASE_DIR) / "reports"
            / "calendar_rule_source_audit_2026_2028" / "cache"
        )
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Molitvoslov-source-year-generator/1.0"
        })

        # Download all evidence and fasting markers BEFORE changing the DB.
        pages = {2026: {}, year: {}}
        new_downloads = 0
        try:
            for source_year in sorted(pages):
                for day in year_days(source_year):
                    day_key = day.isoformat()
                    file = root / str(source_year) / (day_key + ".json")
                    source_rows = read_cache(file, day)
                    if source_rows is None:
                        try:
                            downloaded = fetch_day_saint_links(
                                day, session=session, timeout=30,
                            )
                        except Exception as exc:
                            raise CommandError(
                                f"Ошибка получения памятей {day}: {exc}"
                            ) from exc
                        source_rows = [
                            {
                                "title": row.title, "url": row.url,
                                "is_primary": row.is_primary,
                            }
                            for row in downloaded
                        ]
                        file.parent.mkdir(parents=True, exist_ok=True)
                        file.write_text(
                            json.dumps({
                                "date": day_key,
                                "source_url": f"https://azbyka.ru/days/{day_key}",
                                "sources": source_rows,
                            }, ensure_ascii=False, indent=2),
                            encoding="utf-8",
                        )
                        new_downloads += 1
                        time.sleep(max(0.5, opts["delay"]))
                    pages[source_year][day_key] = source_rows

            try:
                markers = fetch_calendar(year, timeout=30)
            except Exception as exc:
                raise CommandError(
                    f"Не удалось прочитать годовые признаки постов {year}: {exc}"
                ) from exc
            expected = len(list(year_days(year)))
            if len(pages[year]) != expected or len(markers) != expected:
                raise CommandError(
                    "Неполный источник дат/постов, запись запрещена."
                )
            plan, mismatch, unmatched = index_source(
                reference, pages[2026], pages[year]
            )
            if len(plan) != expected or any(
                not plan[str(day)] for day in year_days(year)
            ):
                raise CommandError("Есть дни без памятей, запись запрещена.")

            pascha = orthodox_pascha(year)
            pascha_2026 = orthodox_pascha(2026)
            pascha_candidates = [
                local[x.main_feast_id]
                for x in base_days
                if x.date_gregorian == pascha_2026 and
                x.main_feast_id in local and
                "светлое христово воскресение" in
                normalize_title(local[x.main_feast_id].title)
            ]
            if len(pascha_candidates) != 1:
                raise CommandError("Не удалось найти Пасху 2026 в SQLite.")
            feast_pascha = pascha_candidates[0]
            plan[str(pascha)].insert(0, {
                "local_id": feast_pascha.pk,
                "identity": f"pascha:{year}",
                "source": {
                    "title": feast_pascha.title,
                    "url": "https://azbyka.ru/days/pascha",
                    "is_primary": True,
                },
            })

            mapped_ids = [
                row["local_id"]
                for rows in plan.values() for row in rows
                if row["local_id"] is not None
            ]
            if len(mapped_ids) != len(set(mapped_ids)):
                raise CommandError(
                    "Одна карточка попала в несколько дней: запись запрещена."
                )
            new_items = {
                row["identity"]: row["source"]
                for rows in plan.values() for row in rows
                if row["local_id"] is None
            }
            fast_count = sum(
                "post" in value.get("classes", [])
                for value in markers.values()
            )
            report_dir = Path(settings.BASE_DIR) / "reports" / (
                f"calendar_source_generation_{year}"
            )
            report_dir.mkdir(parents=True, exist_ok=True)
            report_path = report_dir / "summary.json"
            report = {
                "year": year,
                "mode": "APPLY" if opts["apply"] else "DRY-RUN",
                "pascha": str(pascha),
                "days": expected,
                "source_observances": sum(map(len, pages[year].values())),
                "reused_existing_feasts": len(mapped_ids),
                "new_source_feasts": len(new_items),
                "post_days": fast_count,
                "unmatched_source_entries": unmatched,
                "ambiguous_2026_links": mismatch,
                "days_downloaded_now": new_downloads,
            }
            report_path.write_text(
                json.dumps(report, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            self.stdout.write(
                f"Год {year}, Пасха {pascha}: дней {expected}; "
                f"памятей по источнику {report['source_observances']}; "
                f"привязано к существующим {len(mapped_ids)}; "
                f"новых карточек {len(new_items)}; "
                f"постных дней {fast_count}."
            )
            if not opts["apply"]:
                self.stdout.write(
                    f"DRY-RUN: SQLite не изменена. Отчёт {report_path}"
                )
                return

            # Transaction starts only after full evidence and a local backup.
            from api.sqlite_backup import create_sqlite_backup
            backup_path, sha256 = create_sqlite_backup(
                Path(settings.DATABASES["default"]["NAME"]),
                Path(settings.BASE_DIR) / "backups" / "sqlite",
            )
            self.stdout.write(f"BACKUP: {backup_path} SHA256 {sha256}")
            details = {}
            content_errors = []
            if not opts["skip_new_card_content"]:
                for source in new_items.values():
                    url = source["url"]
                    if url in details:
                        continue
                    try:
                        details[url] = fetch_saint_content(
                            url, session=session, timeout=30,
                        )
                    except Exception as exc:
                        # A missing biography must not prevent accurate
                        # observance placement; report a content gap.
                        details[url] = None
                        content_errors.append({"url": url, "error": str(exc)})
                    time.sleep(max(0.5, opts["delay"]))

            created = {}
            for identity, source in new_items.items():
                uid = uuid.uuid5(NAMESPACE, identity)
                feast = CalendarFeast.objects.filter(sync_uid=uid).first()
                if feast is None:
                    full = details.get(source["url"])
                    feast = CalendarFeast(
                        sync_uid=uid,
                        title=source["title"],
                        short_title=source["title"],
                        icon_url=getattr(full, "icon_source_url", "") or "",
                        troparion_title=getattr(full, "troparion_title", "") or "",
                        troparion_content=getattr(full, "troparion_content", "") or "",
                        kontakion_title=getattr(full, "kontakion_title", "") or "",
                        kontakion_content=getattr(full, "kontakion_content", "") or "",
                        life_title=getattr(full, "life_title", "") or "",
                        life_content=getattr(full, "life_content", "") or "",
                    )
                created[identity] = feast

            known_fasts = {
                fast.code: fast for fast in CalendarFastType.objects.all()
            }
            with transaction.atomic():
                if existing_days:
                    # Only target year, and only after explicit permission.
                    CalendarDay.objects.filter(
                        date_gregorian__year=year,
                    ).delete()
                for feast in created.values():
                    if feast.pk is None:
                        feast.save()
                all_feasts = dict(local)
                all_feasts.update({
                    feast.pk: feast for feast in created.values()
                })
                for day in year_days(year):
                    rows = plan[str(day)]
                    for row in rows:
                        if row["local_id"] is None:
                            row["local_id"] = created[row["identity"]].pk
                    choice = main_observance(
                        rows, all_feasts, reference_main
                    )
                    if choice is None:
                        raise CommandError(
                            f"Отсутствует главная память за {day}"
                        )
                    feast = all_feasts[choice["local_id"]]
                    jul_month, jul_day = julian_month_day(day)
                    fast_info = fasting(
                        day, markers[str(day)], known_fasts
                    )
                    obj = CalendarDay.objects.create(
                        date_gregorian=day,
                        julian_month=jul_month,
                        julian_day=jul_day,
                        main_feast=feast,
                        summary=feast.title,
                        short_summary=feast.short_title or feast.title,
                        source_payload={
                            "calendar_source_generator": {
                                "source": f"https://azbyka.ru/days/{day}",
                                "year": year,
                                "observances": len(rows),
                                "main_source_url": choice["source"]["url"],
                                "method": "authoritative yearly source",
                            },
                            "azbyka_calendar_markers": {
                                "source": f"https://azbyka.ru/days/calendar/{year}",
                                "classes": markers[str(day)].get("classes", []),
                                "is_fasting_day": "post" in markers[str(day)].get("classes", []),
                                "is_solid_week": "solid" in markers[str(day)].get("classes", []),
                                "is_major_feast": "great12" in markers[str(day)].get("classes", []),
                                "is_easter": "easter" in markers[str(day)].get("classes", []),
                            },
                        },
                        **fast_info,
                    )
                    obj.feasts.set(
                        list(dict.fromkeys(row["local_id"] for row in rows))
                    )
                if CalendarDay.objects.filter(
                    date_gregorian__year=year,
                ).count() != expected:
                    raise CommandError("Неполный год, транзакция отменена.")
            report["new_card_content_errors"] = content_errors
            report["result"] = "OK"
            report_path.write_text(
                json.dumps(report, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            self.stdout.write(self.style.SUCCESS(
                f"ГОТОВО: {year}, {expected} дней, "
                f"Пасха {pascha}, святые и посты записаны в SQLite. "
                f"Пробелов в контенте новых карточек: {len(content_errors)}."
            ))
            if opts["with_readings"]:
                self.stdout.write(
                    "Заполнение опубликованных чтений выбранного года..."
                )
                call_command(
                    "fill_calendar_readings",
                    year=year, apply=True,
                    stdout=self.stdout, stderr=self.stderr,
                )
        finally:
            session.close()
