#!/usr/bin/env python3
"""Generate non-destructive QA of Akathists imported from audited Azbyka pages.

Does not store prayer text in the report. Checks structural integrity, content
lengths, missing Russian translations, and possible HTML/site-footer leakage.
"""
import argparse
import json
import re
from collections import Counter
from pathlib import Path

from azbyka_akathist_batch import SOURCE, read_json, verify_detail, write_json_atomic

TAIL_MARKERS = (
    "Читайте также", "Поделиться ссылкой", "Оцените материал",
    "Комментарии к статье", "Материалы по теме", "Подписывайтесь",
)
HTML_TAG = re.compile(r"<\s*(?:p|div|table|script|style|br|span|article)\b", re.I)


def inspect(staged, report):
    if report.get("source") != SOURCE:
        raise ValueError("Неизвестный источник отчёта.")
    details = staged.get("akathists", {}).get("by_slug", {})
    imported = sorted({
        item.get("slug") for item in report.get("pages", {}).values()
        if isinstance(item, dict) and item.get("status") == "imported" and item.get("slug")
    })
    rows = []
    for slug in imported:
        detail = details.get(slug)
        problems = []
        if not verify_detail(detail):
            problems.append({"severity": "error", "reason": "Неполные 13 кондаков / 12 икосов"})
            rows.append({"slug": slug, "problems": problems})
            continue
        counts = Counter(section.get("section_type") for section in detail["sections"])
        translated = 0
        short_sections = 0
        for section in detail["sections"]:
            text = section.get("text") or {}
            church = str(text.get("content") or "")
            russian = str(text.get("translation") or "")
            if russian.strip():
                translated += 1
            if len(church.strip()) < 35:
                short_sections += 1
            if HTML_TAG.search(church) or HTML_TAG.search(russian):
                problems.append({"severity": "error", "reason": "HTML в тексте раздела",
                                 "section": section.get("section_type"), "number": section.get("number")})
            if any(marker.casefold() in church.casefold() for marker in TAIL_MARKERS):
                problems.append({"severity": "warning", "reason": "Возможный мусор страницы",
                                 "section": section.get("section_type"), "number": section.get("number")})
        if short_sections:
            problems.append({"severity": "warning", "reason": f"Очень коротких разделов: {short_sections}"})
        if not counts.get("prayer"):
            problems.append({"severity": "warning", "reason": "Заключительная молитва не обнаружена"})
        if translated == 0:
            problems.append({"severity": "warning", "reason": "Русский перевод не обнаружен"})
        elif translated < 12:
            problems.append({"severity": "warning", "reason": f"Переводы только у {translated} разделов"})
        rows.append({
            "slug": slug, "title": detail.get("title"),
            "sections": len(detail["sections"]),
            "kontakia_with_repetition": counts.get("kontakion", 0),
            "ikoses_with_repetition": counts.get("ikos", 0),
            "prayers": counts.get("prayer", 0),
            "translated_sections": translated,
            "problems": problems,
        })
    return {
        "imported_in_report": len(imported),
        "checked": len(rows),
        "critical": sum(1 for row in rows for issue in row["problems"] if issue["severity"] == "error"),
        "warnings": sum(1 for row in rows for issue in row["problems"] if issue["severity"] == "warning"),
        "rows": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = inspect(read_json(args.staged), read_json(args.report))
        write_json_atomic(args.output, result)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(1, "QA остановлен: " + str(exc) + "\n")
    print(f"QA: {result['checked']} акафистов, критических ошибок {result['critical']}, "
          f"предупреждений {result['warnings']}")
    for row in result["rows"][:8]:
        print(f"  {row.get('title') or row['slug']}: {row.get('sections', 0)} частей, "
              f"молитв {row.get('prayers', 0)}, переводов {row.get('translated_sections', 0)}")
    print("QA report: " + args.output)
    if result["critical"]:
        parser.exit(1, "Обнаружены критические проблемы. Объединение JSON не выполняйте.\n")


if __name__ == "__main__":
    main()
