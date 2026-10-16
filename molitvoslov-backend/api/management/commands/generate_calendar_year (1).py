mode.add_argument("--dry-run", action="store_true")
mode.add_argument("--apply", action="store_true")


def handle(self, *args, **options):
    year = options["year"]
    if not 2027 <= year <= 2030:
        raise CommandError("В этой версии разрешены только 2027–2030 годы")
    if connections["default"].vendor != "sqlite":
        raise CommandError("Для безопасности требуется локальная SQLite")
    easter = pascha(year)
    requested_dates = [
        d for d in dates_in_year(year) if not options["month"] or d.month == options["month"]
    ]
    source_days = list(
        CalendarDay.objects.filter(date_gregorian__year=2026).prefetch_related("feasts")
    )
    if len(source_days) != 365:
        raise CommandError("В базе должно быть 365 дней исходного 2026 года")
    # Map main-feast preference from the source year. It is a fallback only.
    source_main = defaultdict(int)
    for source_day in source_days:
        if source_day.main_feast_id:
            source_main[source_day.main_feast_id] += 1

    target = defaultdict(set)
    unclassified = []
    for feast in CalendarFeast.objects.all().iterator():
        destinations = set()
        if feast.easter_offset is not None:
            dest = easter + timedelta(days=feast.easter_offset)
            if dest.year == year:
                destinations.add(dest)
        elif feast.julian_month and feast.julian_day:
            dest = julian_date(year, feast.julian_month, feast.julian_day)
            if dest:
                destinations.add(dest)
        else:
            unclassified.append((feast.pk, str(feast)[:70]))
            continue
        for dest in destinations:
            target[dest].add(feast.pk)

    # Existing days are preserved unless individual missing fields can safely be filled.
    existing = {
        day.date_gregorian: day for day in CalendarDay.objects.filter(date_gregorian__year=year)
    }
    feast_lookup = CalendarFeast.objects.in_bulk(set().union(*target.values()) if target else set())
    created = 0
    untouched = 0
    completed = 0
    empty = 0
    replaced = 0
    if options["apply"]:
        backup = safe_backup()
        self.stdout.write(f"BACKUP: {backup}")
    with transaction.atomic():
        for d in requested_dates:
            day_existing = existing.get(d)
            feast_ids = target.get(d, set())
            if not feast_ids:
                empty += 1
            sorted_feasts = sorted(
                (feast_lookup[i] for i in feast_ids),
                key=lambda f: (-priority(f), -source_main[f.pk], f.pk),
            )
            principal = sorted_feasts[0] if sorted_feasts else None
            is_fast, fasting_name = fasting_info(d, easter)
            # Existing fields are not copied blindly from 2026: readings and dietary
            # prescriptions have independent year-specific rules.
            julian_previous = d - timedelta(days=13)
            payload = {
                MARKER: {
                    "year": year,
                    "reference_year": 2026,
                    "is_fasting_day": is_fast,
                    "is_dietary_rule_complete": False,
                }
            }
            if day_existing is not None:
                changed = False
                if options["replace_links"]:
                    old_ids = set(day_existing.feasts.values_list("id", flat=True))
                    # The existing selected main feast has no special protection in overwrite mode.
                    # Select it afresh from the computed target list (or clear it if no candidates).
                    new_main_id = principal.pk if principal else None
                    changed = old_ids != feast_ids or day_existing.main_feast_id != new_main_id
                    if changed and options["apply"]:
                        day_existing.feasts.set(feast_ids)
                        if day_existing.main_feast_id != new_main_id:
                            day_existing.main_feast_id = new_main_id
                            day_existing.save(update_fields=["main_feast", "updated_at"])
                    if changed:
                        replaced += 1
                    else:
                        untouched += 1
                    continue
                # Default non-destructive mode: predict exactly the changes also in dry-run.
                old_ids = set(day_existing.feasts.values_list("id", flat=True))
                need_links = not old_ids and bool(feast_ids)
                need_main = day_existing.main_feast_id is None and principal is not None
                need_fast = bool(
                    not day_existing.fast_name
                    and not day_existing.fast_type_id
                    and not day_existing.fast_type_code
                    and not day_existing.fast_type_title
                    and is_fast
                )
                changed = need_links or need_main or need_fast
                if changed and options["apply"]:
                    if need_links:
                        day_existing.feasts.set(feast_ids)
                    if need_main:
                        day_existing.main_feast = principal
                        day_existing.save(update_fields=["main_feast", "updated_at"])
                    if need_fast:
                        day_existing.fast_name = fasting_name
                        day_existing.fast_type_title = "Постный день"
                        day_existing.save(
                            update_fields=["fast_name", "fast_type_title", "updated_at"]
                        )
                if changed:
                    completed += 1
                else:
                    untouched += 1
                continue
            if options["apply"]:
                obj = CalendarDay.objects.create(
                    date_gregorian=d,
                    julian_month=julian_previous.month,
                    julian_day=julian_previous.day,
                    main_feast=principal,
                    fast_name=fasting_name,
                    fast_type_title="Постный день" if is_fast else "",
                    source_payload=payload,
                )
                if feast_ids:
                    obj.feasts.set(feast_ids)
            created += 1
    self.stdout.write(f"Пасха {year}: {easter}")
    self.stdout.write(
        f"{'APPLY' if options['apply'] else 'DRY-RUN'}: новых дней={created}; дополнено существующих={completed}; заменены связи существующих={replaced}; существующих без изменений={untouched}; дней без назначенных памятей={empty}"
    )
    self.stdout.write(f"Карточек без поддерживаемого правила даты: {len(unclassified)}")
    for pk, title in unclassified[:15]:
        self.stdout.write(f"  ID={pk}: {title}")
    if unclassified:
        self.stdout.write(
            self.style.WARNING(
                "Карточки без даты не переносились; при необходимости задайте julian_month/julian_day или easter_offset."
            )
        )
    self.stdout.write(
        "Чтения, жития, тропари, кондаки и карточки святых не изменялись. При --replace-links перезаписаны только связи памятей и main_feast выбранного периода."
    )
