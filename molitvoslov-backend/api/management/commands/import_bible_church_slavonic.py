"""Safe PILOT import of Church Slavonic from a reviewed HIP->Unicode candidate.

Never writes to the Synodal 'rst' translation. The input is generated locally from
the user's csl.zip and is deliberately NOT checked into the repository.
Only GEN, PSA 1..150, and MAT are enabled pending verification of the full corpus
and its redistribution rights.
"""
import hashlib
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import BibleBook, BibleTranslation
from api.management.commands.import_bible_synodal import Command as SynodalImporter


TRANSLATION_CODE = "csl_traditional"
PILOT_BOOKS = {
    "GEN": ("Книга Бытія", "Быт.", "genesis", BibleBook.TESTAMENT_OLD, BibleBook.SECTION_OLD),
    "PSA": ("Псалтирь", "Пс.", "psalms", BibleBook.TESTAMENT_OLD, BibleBook.SECTION_OLD),
    "MAT": ("Евангеліе от Матѳея", "Мѳ.", "matthew", BibleBook.TESTAMENT_NEW, BibleBook.SECTION_GOSPELS),
}


def read_pilot(path):
    """Validate *everything* before allowing any database write."""
    try:
        raw = path.read_bytes()
        source = json.loads(raw.decode("utf-8-sig"))
    except (OSError, UnicodeError, ValueError) as exc:
        raise CommandError(f"Не удалось прочитать Unicode-кандидат: {exc}") from exc

    if source.get("schema_version") != 0:
        raise CommandError("Ожидался предварительный кандидат schema_version=0.")
    source_translation = source.get("translation") or {}
    if source_translation.get("code") != "csl_traditional_CANDIDATE":
        raise CommandError("Некорректный источник: нужен csl_traditional_CANDIDATE.")

    selected = {}
    for book in source.get("books") or []:
        code = str(book.get("code") or "").upper()
        if code not in PILOT_BOOKS:
            continue
        if code in selected:
            raise CommandError(f"Повторяющаяся книга {code}.")
        if code in {"GEN", "MAT"} and book.get("status") != "parsed":
            raise CommandError(f"Книга {code} не прошла предварительную проверку.")
        if code == "PSA" and book.get("status") not in {"parsed", "needs_review"}:
            raise CommandError("Псалтирь не готова даже для пилотного импорта.")

        chapters = {}
        for chapter in book.get("chapters") or []:
            number = chapter.get("number")
            # The 151st psalm lacks verse markers in the original HIP archive.
            # Exclude it rather than invent verse identifiers.
            if code == "PSA" and number == 151:
                continue
            if type(number) is not int or number <= 0 or number in chapters:
                raise CommandError(f"{code}: неверный или повторный номер главы {number}.")
            verse_map = {}
            for verse in chapter.get("verses") or []:
                verse_number = verse.get("number")
                text = verse.get("text")
                if type(verse_number) is not int or verse_number < 1 or verse_number in verse_map:
                    raise CommandError(f"{code} {number}: неверный номер стиха {verse_number}.")
                if not isinstance(text, str) or not text.strip():
                    raise CommandError(f"{code} {number}:{verse_number}: пустой стих.")
                if any(token in text for token in ("\ufffd", "\uf8ff", "%{Глава", "<p>")):
                    raise CommandError(f"{code} {number}:{verse_number}: нераспознанная разметка.")
                verse_map[verse_number] = text.strip()

            if not verse_map or sorted(verse_map) != list(range(1, max(verse_map) + 1)):
                raise CommandError(f"{code} {number}: неполная или неверная нумерация стихов.")
            chapters[number] = verse_map

        expected_chapters = {"GEN": 50, "PSA": 150, "MAT": 28}[code]
        if sorted(chapters) != list(range(1, expected_chapters + 1)):
            raise CommandError(f"{code}: ожидалось {expected_chapters} последовательных глав.")
        selected[code] = {
            "order": book.get("canonical_source_order"),
            "chapters": chapters,
        }

    if set(selected) != set(PILOT_BOOKS):
        raise CommandError("Кандидат должен содержать GEN, PSA и MAT.")
    if len(set(b["order"] for b in selected.values())) != len(selected):
        raise CommandError("Дублирующиеся порядковые номера книг.")
    return selected, hashlib.sha256(raw).hexdigest()


class Command(BaseCommand):
    help = "Пилотный импорт Бытия, Псалтири 1–150, Матфея на ЦС традиционном."

    def add_arguments(self, parser):
        parser.add_argument("--input", required=True, help="Путь к csl_traditional_candidate.json.")
        parser.add_argument(
            "--check-only", action="store_true", help="Проверить корпус без изменения базы."
        )

    def handle(self, *args, **options):
        input_path = Path(options["input"]).expanduser().resolve()
        selected, source_hash = read_pilot(input_path)
        counts = {code: sum(len(v) for v in b["chapters"].values()) for code, b in selected.items()}
        self.stdout.write(f"Проверка ЦС: {counts}; SHA256: {source_hash}")

        if options["check_only"]:
            self.stdout.write(self.style.SUCCESS("Проверка завершена, БД не изменена."))
            return

        with transaction.atomic():
            translation, _ = BibleTranslation.objects.update_or_create(
                code=TRANSLATION_CODE,
                defaults={
                    "name": "Церковнославянский (традиционный, пробная версия)",
                    "language": "cu",
                    "script_variant": BibleTranslation.SCRIPT_VARIANT_CHURCH_TRADITIONAL,
                    "source_url": "",
                    "source_revision": source_hash,
                    "license_name": "Не проверена — внутреннее тестирование",
                    "is_visible": True,
                },
            )
            syncer = SynodalImporter()
            for code, data in selected.items():
                name, short_name, slug, testament, section = PILOT_BOOKS[code]
                book, _ = BibleBook.objects.update_or_create(
                    translation=translation,
                    code=code,
                    defaults={
                        "name": name,
                        "short_name": short_name,
                        "slug": slug,
                        "testament": testament,
                        "section": section,
                        "canonical_order": data["order"],
                        "is_appendix": False,
                    },
                )
                # Uses the same bulk import mechanism as rst; existing verse IDs
                # remain stable for records whose (book, chapter, verse) persists.
                syncer.sync_book(book, data["chapters"])

        self.stdout.write(self.style.SUCCESS(
            f"ЦС пилот импортирован: {len(selected)} книги, {sum(counts.values())} стихов. "
            "Синодальная Библия не изменена."
        ))
