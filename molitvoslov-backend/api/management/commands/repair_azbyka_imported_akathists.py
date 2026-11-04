"""Safely repair missing Akathist refrain paragraphs from an earlier batch import.

An older parser treated every second untagged <p> as a translation, so the CS
tab lost the refrain. Only Akathists with an import provenance record are
candidates; edited texts are never overwritten. A patch is emitted for the
offline JSON after applying the database correction.
"""
import json
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.management.commands.audit_azbyka_akathist_catalog import (
    CATALOG_URL, USER_AGENT, parsed_content_sha256, save_json,
)
from api.management.commands.import_akathist import (
    Command as AkathistParser, CONTENT_CLASSES, TRANSLATION_CLASSES,
)
from api.models import Akathist, AkathistSection, Text


class LegacyAkathistParser(AkathistParser):
    """Read-only emulation of the parser used to generate the import report."""

    def inherited_language_classes(self, element):
        return set(element.get("class") or [])

    def parse_parallel_akathist_blocks(self, blocks):
        if not blocks:
            return "", ""
        return self.join_parts(blocks[::2]), self.join_parts(blocks[1::2])

    def parse_element_group(self, elements, section_type):
        filtered = []
        for item in elements:
            text = item["text"]
            if self.is_three_times_note(text) or self.is_repeat_instruction(text):
                continue
            if self.is_service_annotation(text):
                continue
            if self.is_page_tail_marker(text):
                break
            if section_type == "prayer" and self.is_common_ending_marker(text):
                break
            filtered.append(item)
        if not filtered:
            return "", ""
        content_parts = []
        translation_parts = []
        unknown_parts = []
        has_language_classes = False
        for item in filtered:
            text = item["text"]
            classes = {cls.lower() for cls in item["classes"]}
            if classes & CONTENT_CLASSES:
                has_language_classes = True
                content_parts.append(text)
                continue
            if classes & TRANSLATION_CLASSES:
                has_language_classes = True
                translation_parts.append(text)
                continue
            unknown_parts.append(text)
        if has_language_classes:
            if not content_parts and unknown_parts:
                content_parts.extend(unknown_parts)
            return self.join_parts(content_parts), self.join_parts(translation_parts)
        blocks = [item["text"] for item in filtered]
        if self.has_numbered_translations(blocks):
            return self.parse_numbered_translation_blocks(blocks)
        if section_type == "prayer":
            return self.parse_unclassified_prayer(blocks)
        return self.parse_parallel_akathist_blocks(blocks)


def parse_page(parser_class, soup, slug, title, url):
    parser = parser_class()
    parser.akathist_slug = slug
    parser.akathist_title = title
    parser.source_url = url
    root = parser.find_best_root(soup)
    troparion, kontakion_before = parser.parse_preface_hymns(root)
    sections = parser.normalize_sections(parser.parse_sections(root))
    parser.validate_sections(sections)
    return sections, troparion, kontakion_before


def make_section_map(sections):
    pairs = [(entry["type"], entry["number"]) for entry in sections]
    if len(pairs) != len(set(pairs)):
        raise ValueError("Повторяющиеся тип и номер раздела.")
    return {(entry["type"], entry["number"]): entry for entry in sections}


def check_special(model_text, legacy, fresh):
    if legacy is None and fresh is None:
        return []
    if legacy is None or fresh is None or model_text is None:
        raise ValueError("Изменилось число дополнительных тропарей/кондаков.")
    old = (legacy.get("content", ""), legacy.get("translation", ""))
    new = (fresh.get("content", ""), fresh.get("translation", ""))
    current = (model_text.content, model_text.translation)
    if current != old and current != new:
        raise ValueError("Дополнительный текст был отредактирован; не перезаписываем.")
    return [{"text": model_text, "old": old, "new": new}]


def collect_protected_changes(akathist, old_sections, new_sections, old_specials, new_specials):
    legacy = make_section_map(old_sections)
    fresh = make_section_map(new_sections)
    if legacy.keys() != fresh.keys():
        raise ValueError("Изменился набор номеров кондаков, икосов или молитв.")
    existing = {}
    sections = AkathistSection.objects.filter(akathist=akathist).select_related("text")
    for section in sections:
        key = (section.section_type, section.number)
        previous = existing.get(key)
        if previous and previous.id != section.text_id:
            raise ValueError("Разные тексты у повторяющегося раздела.")
        existing[key] = section.text
    if set(existing) != set(legacy):
        raise ValueError("Состав разделов Django отличается от первоначального импорта.")
    updates = []
    for key, old in legacy.items():
        latest = fresh[key]
        model_text = existing[key]
        previous = (old.get("content", ""), old.get("translation", ""))
        corrected = (latest.get("content", ""), latest.get("translation", ""))
        current = (model_text.content, model_text.translation)
        if current != previous and current != corrected:
            raise ValueError("Изменённый вручную текст не будет перезаписан: %s" % (key,))
        if previous != corrected:
            updates.append({
                "type": key[0], "number": key[1], "text": model_text,
                "old": previous, "new": corrected,
            })
    for field, old, fresh in (
        ("troparion", old_specials[0], new_specials[0]),
        ("kontakion_before", old_specials[1], new_specials[1]),
    ):
        obj = getattr(akathist, field)
        for value in check_special(obj, old, fresh):
            if value["old"] != value["new"]:
                updates.append({"type": field, "number": None, **value})
    for entry in updates:
        other_akathists = AkathistSection.objects.filter(
            text_id=entry["text"].id
        ).exclude(akathist=akathist).exists()
        if other_akathists:
            raise ValueError("Раздел связан с другим акафистом; исправление остановлено.")
    return updates


class Command(BaseCommand):
    help = "Исправить только нетронутые тексты, ранее импортированные из Азбуки веры."

    def add_arguments(self, parser):
        parser.add_argument("--report", default="files/akathists/azbyka_import_report.json")
        parser.add_argument("--output", default="files/akathists/azbyka_repair_patch.json")
        parser.add_argument("--limit", type=int, default=5)
        parser.add_argument("--delay", type=float, default=2.0)
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        if options["limit"] < 0 or options["delay"] < 1:
            raise CommandError("Недопустимые limit/delay.")
        try:
            report = json.loads(Path(options["report"]).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise CommandError("Отчёт импорта не прочитан: %s" % exc) from exc
        if report.get("source") != CATALOG_URL:
            raise CommandError("Неизвестный источник отчёта импорта.")
        records = [
            (url, value) for url, value in report.get("pages", {}).items()
            if value.get("status") == "imported" and value.get("created_id")
        ]
        records.sort(key=lambda row: row[0])
        if options["limit"]:
            records = records[:options["limit"]]
        result = {"source": CATALOG_URL, "changes": [], "skipped": []}
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})
        for number, (url, meta) in enumerate(records, 1):
            slug = meta["slug"]
            try:
                if not url.startswith("https://azbyka.ru/molitvoslov/"):
                    raise ValueError("Неизвестная ссылка.")
                item = Akathist.objects.get(slug=slug, id=meta["created_id"])
                response = session.get(url, timeout=45)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "html.parser")
                original = parse_page(LegacyAkathistParser, soup, slug, item.title, url)
                corrected = parse_page(AkathistParser, soup, slug, item.title, url)
                old_hash = parsed_content_sha256(*original)
                if old_hash != meta.get("content_sha256"):
                    raise ValueError("Старый контрольный отпечаток не совпал; страница изменилась.")
                updates = collect_protected_changes(
                    item, original[0], corrected[0], original[1:], corrected[1:]
                )
                if not updates:
                    self.stdout.write(f"[{number}] {slug}: без изменений")
                    continue
                self.stdout.write(f"[{number}] {slug}: исправляемых текстов {len(updates)}")
                entry = {
                    "slug": slug, "akathist_id": item.id,
                    "sections": [
                        {
                            "section_type": update["type"], "number": update["number"],
                            "old_content": update["old"][0], "old_translation": update["old"][1],
                            "new_content": update["new"][0], "new_translation": update["new"][1],
                        }
                        for update in updates
                    ],
                }
                if options["apply"]:
                    with transaction.atomic():
                        for update in updates:
                            before, after = update["old"], update["new"]
                            if before == after:
                                continue
                            count = Text.objects.filter(
                                id=update["text"].id,
                                content=before[0], translation=before[1],
                            ).update(content=after[0], translation=after[1])
                            if count == 0:
                                # Idempotent when Django was fixed but the offline
                                # file still needs to be patched.
                                updated = Text.objects.get(id=update["text"].id)
                                if (updated.content, updated.translation) != after:
                                    raise ValueError("Текст изменился во время исправления.")
                    result["changes"].append(entry)
                else:
                    result["changes"].append(entry)
            except (ValueError, requests.RequestException, Akathist.DoesNotExist) as exc:
                result["skipped"].append({"slug": slug, "reason": str(exc)[:300]})
                self.stderr.write(self.style.WARNING(f"{slug}: пропущен ({exc})"))
            if number < len(records):
                time.sleep(options["delay"])
        if options["apply"]:
            save_json(Path(options["output"]), result)
        self.stdout.write(
            f"Подготовлено исправлений: {len(result['changes'])}; "
            f"пропущено: {len(result['skipped'])}; запись в БД: {bool(options['apply'])}"
        )
        if options["apply"]:
            self.stdout.write("JSON-патч: " + str(options["output"]))
        if result["skipped"]:
            self.stdout.write("Пропуски безопасны: конфликтующие записи не менялись.")
