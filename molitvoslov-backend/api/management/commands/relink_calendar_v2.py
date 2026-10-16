"""Safely re-link existing days in 2027+ to curated 2026 CalendarFeast records.

This is deliberately NOT a full-year generator and does not claim liturgical
correctness for readings, fasting details, or exceptional feast transfers.
No CalendarFeast is created, updated, merged, or deleted.

Run:
    python manage.py relink_calendar_v2 --year 2027 --month 1 --dry-run
    python manage.py relink_calendar_v2 --year 2027 --month 1 --apply
"""

from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.calendar_engine_v2 import (
    REFERENCE_YEAR,
    build_schedule,
    orthodox_pascha,
    pick_main,
    year_days,
)
from api.calendar_models import CalendarDay, CalendarFeast
from api.management.commands.generate_calendar_v2 import source_rules_2026


def _csv(path, rows, headers):
    with path.open('w', encoding='utf-8-sig', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=headers, delimiter=';', extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


def _backup(db: Path, folder: Path, timestamp: str):
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f'before_relink_calendar_v2_{timestamp}.sqlite3'
    if destination.exists():
        raise CommandError(f'Резервная копия уже существует: {destination}')
    with sqlite3.connect(str(db), timeout=30) as source, sqlite3.connect(str(destination)) as target:
        source.backup(target)
        integrity = target.execute('PRAGMA integrity_check').fetchone()[0]
    if integrity != 'ok':
        destination.unlink(missing_ok=True)
        raise CommandError(f'BACKUP не прошёл проверку целостности: {integrity}')
    return destination


def _fingerprint_2026():
    """Defence in depth: snapshot 2026 dates, M2M links, and main links."""
    rows = list(CalendarDay.objects.filter(date_gregorian__year=REFERENCE_YEAR)
                .order_by('date_gregorian').values_list('id', 'date_gregorian', 'main_feast_id'))
    day_ids = [r[0] for r in rows]
    through = CalendarDay.feasts.through
    links = list(through.objects.filter(calendarday_id__in=day_ids)
                 .order_by('calendarday_id', 'calendarfeast_id')
                 .values_list('calendarday_id', 'calendarfeast_id'))
    raw = repr((rows, links)).encode('utf-8')
    return hashlib.sha256(raw).hexdigest(), len(rows), len(links)


def _label(feast):
    if feast is None:
        return ''
    text = (feast.short_title or feast.title or '').replace('\r', ' ').replace('\n', ' ').strip()
    return f'[{feast.pk}] {text}'


def _reference_check(source):
    expected = {}
    main = {}
    for memorial in source:
        expected.setdefault(memorial.source_date, set()).add(memorial.id)
        if memorial.is_reference_main:
            main[memorial.source_date] = memorial.id
    calculated, specials = build_schedule(source, REFERENCE_YEAR)
    for day, rules in calculated.items():
        if {r.feast_id for r in rules} != expected.get(day, set()) or pick_main(rules) != main.get(day):
            raise CommandError(f'Эталон 2026 не воспроизведён для {day}. Запись запрещена.')
    if len(expected) != 365:
        raise CommandError('Эталон 2026 должен содержать ровно 365 дат')
    return len(specials)


class Command(BaseCommand):
    help = ('Заменить ТОЛЬКО календарные связи памятей в существующих днях 2027+ '
            'ссылками на заполненные карточки 2026. Посты и чтения не менять.')

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, required=True)
        parser.add_argument('--month', type=int, choices=range(1, 13), metavar='1..12')
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument('--dry-run', action='store_true')
        mode.add_argument('--apply', action='store_true')
        parser.add_argument('--exclude-date', action='append', default=[], metavar='YYYY-MM-DD',
                            help='Не изменять указанную дату; допускается несколько раз')
        parser.add_argument('--allow-main-conflicts', action='store_true',
                            help='Только после проверки: разрешить замену дня с несколькими кандидатами на главную память')

    def handle(self, *args, **options):
        year = options['year']
        month = options.get('month')
        apply_changes = options['apply']
        if not 2027 <= year <= 2099:
            raise CommandError('Разрешены только 2027–2099. 2026 и более ранние годы защищены.')
        if connections['default'].vendor != 'sqlite':
            raise CommandError('Команда работает только на локальной SQLite, не на Supabase.')
        db = Path(settings.DATABASES['default']['NAME']).resolve()
        if not db.is_file():
            raise CommandError(f'Локальная SQLite не найдена: {db}')

        days = [d for d in year_days(year) if month is None or d.month == month]
        expected_dates = {d.isoformat() for d in days}
        excluded = set(options['exclude_date'])
        bad_excluded = sorted(excluded - expected_dates)
        if bad_excluded:
            raise CommandError('Даты --exclude-date вне выбранного периода: ' + ', '.join(bad_excluded))

        source = source_rules_2026()
        special_ref_count = _reference_check(source)
        schedule, special_target = build_schedule(source, year)
        # A skipped/unclassified rule could belong to any date: write only if
        # the source is fully classified. Self-check in 2026 alone is not enough.
        if special_target:
            raise CommandError(
                f'В правилах есть {len(special_target)} нераспознанных памятей. '
                'Изменения запрещены; проверьте календарный движок.'
            )
        existing = {
            d.date_gregorian: d
            for d in CalendarDay.objects.filter(date_gregorian__gte=days[0],
                                                date_gregorian__lte=days[-1])
            .select_related('main_feast').prefetch_related('feasts')
        }
        needed_ids = {r.feast_id for day in days for r in schedule[day]}
        feast_by_id = CalendarFeast.objects.in_bulk(needed_ids)
        if len(feast_by_id) != len(needed_ids):
            raise CommandError('Не найдены карточки из 2026: ' + str(sorted(needed_ids - set(feast_by_id))[:15]))

        entries = []
        approved = []
        status_counts = Counter()
        for day in days:
            prev = existing.get(day)
            rules = schedule[day]
            new_ids = {r.feast_id for r in rules}
            main_id = pick_main(rules)
            main_candidate_ids = sorted({r.feast_id for r in rules if r.is_reference_main})
            # When two former 'main' cards converge onto a new date, don't
            # silently choose one on a heuristic rank alone.
            collision = len(main_candidate_ids) > 1
            previous_feasts = list(prev.feasts.all()) if prev else []
            old_ids = {f.pk for f in previous_feasts}
            old_main_id = prev.main_feast_id if prev else None

            if day.isoformat() in excluded:
                status = 'EXCLUDED'
            elif prev is None:
                status = 'MISSING_DAY_SKIP'
            elif not new_ids or not main_id or main_id not in new_ids:
                status = 'NO_VALID_RULE_SKIP'
            elif collision and not options['allow_main_conflicts']:
                status = 'MAIN_CONFLICT_SKIP'
            elif old_ids == new_ids and old_main_id == main_id:
                status = 'UNCHANGED'
            else:
                status = 'RELINK'

            status_counts[status] += 1
            entries.append(dict(
                date=day.isoformat(), status=status,
                old_count=len(old_ids), new_count=len(new_ids),
                common_ids=len(old_ids & new_ids),
                old_main=_label(prev.main_feast) if prev else '',
                new_main=_label(feast_by_id.get(main_id)),
                main_candidate_count=len(main_candidate_ids),
                main_candidate_ids=','.join(map(str, main_candidate_ids)),
                old_only_ids=','.join(map(str, sorted(old_ids-new_ids))),
                new_only_ids=','.join(map(str, sorted(new_ids-old_ids))),
                old_titles=' | '.join(sorted(map(_label, previous_feasts))),
                new_titles=' | '.join(sorted(map(_label, (feast_by_id[i] for i in new_ids)))),
                readings_kept='yes', fasting_kept='yes',
            ))
            if status == 'RELINK':
                approved.append((prev.pk, new_ids, main_id, day))

        now = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')
        output_dir = Path(settings.BASE_DIR) / 'reports' / f'calendar_v2_relink_{year}_{now}'
        output_dir.mkdir(parents=True, exist_ok=False)
        report_columns = list(entries[0])
        _csv(output_dir / 'days.csv', entries, report_columns)
        before_fingerprint, before_count, before_links = _fingerprint_2026()
        summary = {
            'year': year, 'month': month, 'mode': 'APPLY' if apply_changes else 'DRY-RUN',
            'reference_2026_days': before_count,
            'reference_2026_links': before_links,
            'reference_2026_selfcheck': 'OK',
            'reference_specials': special_ref_count,
            'target_pascha': orthodox_pascha(year).isoformat(),
            'status_counts': dict(status_counts),
            'planned_days': len(approved),
            'unchanged_count': status_counts['UNCHANGED'],
            'existing_days_not_created': status_counts['MISSING_DAY_SKIP'],
            'no_feast_records_deleted': True,
            'readings_and_fasts_intentionally_unchanged': True,
            'reference_2026_fingerprint_before': before_fingerprint,
            'reference_2026_fingerprint_after': None,
            'backup': None,
            'applied_days': 0,
            'note': ('Изменяются только CalendarDay.feasts и CalendarDay.main_feast. '
                     'Это не проверка полноты чтений/постов и не доказательство '
                     'полной корректности переходящих праздников.'),
        }

        self.stdout.write(
            f'ПРОВЕРКА ЭТАЛОНА 2026: {before_count} дней, {before_links} связей, без изменений.'
        )
        self.stdout.write(f'Пасха {year}: {orthodox_pascha(year)}')
        self.stdout.write(f'Дней рассмотрено: {len(days)}. Статусы: {dict(status_counts)}')
        self.stdout.write(f'Отчёт: {output_dir}')

        if not apply_changes:
            (output_dir / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                                                      encoding='utf-8')
            self.stdout.write('DRY-RUN: база не изменена.')
            return
        if not approved:
            (output_dir / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                                                      encoding='utf-8')
            self.stdout.write('Нет дней для замены; база не изменена.')
            return

        backup = _backup(db, Path(settings.BASE_DIR) / 'backups' / 'sqlite', now)
        summary['backup'] = str(backup)
        self.stdout.write(f'BACKUP: {backup}')
        try:
            with transaction.atomic():
                # The source could change between planning and writing if an
                # external process is running. Re-check it before any update.
                if _fingerprint_2026()[0] != before_fingerprint:
                    raise CommandError('Эталон 2026 изменился во время планирования; отмена.')
                for pk, ids, main_id, target_day in approved:
                    obj = CalendarDay.objects.select_for_update().get(pk=pk)
                    if obj.date_gregorian != target_day or obj.date_gregorian.year <= REFERENCE_YEAR:
                        raise CommandError('Несоответствие ID календарного дня; транзакция отменена.')
                    # Update only the M2M and FK. No text/content/fasting/reading updates.
                    obj.feasts.set(sorted(ids))
                    CalendarDay.objects.filter(pk=pk).update(main_feast_id=main_id)
                    real_ids = set(obj.feasts.values_list('id', flat=True))
                    real_main = CalendarDay.objects.values_list('main_feast_id', flat=True).get(pk=pk)
                    if real_ids != ids or real_main != main_id:
                        raise CommandError(f'Ошибка проверки записи {target_day}; транзакция отменена.')
                after_fingerprint, after_count, after_links = _fingerprint_2026()
                if (after_fingerprint, after_count, after_links) != (
                    before_fingerprint, before_count, before_links
                ):
                    raise CommandError('НАРУШЕН 2026! Все изменения в рамках транзакции отменены.')
        except Exception:
            summary['result'] = 'FAILED_ROLLED_BACK'
            (output_dir / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                                                      encoding='utf-8')
            raise

        summary['applied_days'] = len(approved)
        summary['reference_2026_fingerprint_after'] = after_fingerprint
        summary['result'] = 'OK'
        (output_dir / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                                                  encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(
            f'ГОТОВО: перепривязано дней {len(approved)}. '
            'Святые/тексты/иконы/чтения/посты не изменялись. 2026 не изменён.'
        ))
