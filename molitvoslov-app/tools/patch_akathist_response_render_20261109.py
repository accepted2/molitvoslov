#!/usr/bin/env python3
"""Safely patch only Akathist presentation logic in an existing local app.

Does not touch offlineContent.json, exported books, search database, Django,
or other reader features. Works with locally modified runtime.js when the
three targeted old snippets are still present. Saves backups before writing.

From molitvoslov-app:
    python -X utf8 tools/patch_akathist_response_render_20261109.py --check
    python -X utf8 tools/patch_akathist_response_render_20261109.py --apply
"""
import argparse
import datetime
import os
import shutil
import sys
from pathlib import Path

RUNTIME = Path("src/components/reader/selectableDocumentReader/runtime.js")
TEST = Path("tools/verify_akathist_presentation_20261104.js")

RUNTIME_EDITS = (
    (
        "only standalone invocations receive forced breaks",
        r"""    const collectAkathistInvocationRanges = value => [
      ...collectAkathistWordRanges(value,
        /(?:Радуйтеся|Радуйся|Радꙋйсѧ|Иисусе|Іисусе|И\s+исусе|Исусе|Ісусе|Прииди|Приди|Прийди)/giu),
      ...collectAkathistDoxologyRanges(value),
      ...collectAkathistLordMyRanges(value),
    ];""",
        r"""    // The same address can be a vocative inside ordinary prose:
    // "Возсиял еси Божественною славою, Иисусе, егда..."
    // Only a clause-leading invocation is a litany response. A comma
    // alone is NOT a response boundary; colon/semicolon/full stop/newline
    // preserve the previously supported genuine "Радуйся" refrains.
    const isAkathistResponseStart = (value, start) => {
      const prefix = String(value || '').slice(0, start).trimEnd();
      return !prefix || /[.!?…;:\n][»”“"']*$/u.test(prefix);
    };
    const collectAkathistInvocationRanges = value => [
      ...collectAkathistWordRanges(value,
        /(?:Радуйтеся|Радуйся|Радꙋйсѧ|Иисусе|Іисусе|И\s+исусе|Исусе|Ісусе|Прииди|Приди|Прийди)/giu)
        .filter(range => isAkathistResponseStart(value, range.start)),
      ...collectAkathistDoxologyRanges(value),
      ...collectAkathistLordMyRanges(value),
    ];""",
    ),
    (
        "all common Church Slavonic Alleluia spellings",
        r"""    const collectAkathistAlleluiaRanges = value =>
      collectAkathistWordRanges(value, /(?:Аллилуиа|Аллилуия|Алилуиа|Алілуя|Аллілуя)/giu, true);""",
        r"""    // Original and Church Slavonic spellings, including accented vowels and
    // round /u/ (ꙋ), map to the source text's original character offsets.
    // Highlight acclamations wherever they occur within an Akathist; they
    // are not restricted to Kontakion sections.
    const collectAkathistAlleluiaRanges = value =>
      collectAkathistWordRanges(value, /А(?:лл|л)[иі]л[уꙋ][иіїй]?[ая]/giu, true);""",
    ),
    (
        "highlight Alleluia in all Akathist sections",
        "        const akathistAlleluiaRanges = isAkathistKontakion ? collectAkathistAlleluiaRanges(text) : [];",
        "        const akathistAlleluiaRanges = isAkathist ? collectAkathistAlleluiaRanges(text) : [];",
    ),
)

TEST_EDITS = (
    (
        "update legacy comma expectation",
        "assert.equal(inv('Cacao, радуйся').length, 1, 'Standalone Latin words are not rewritten');",
        "assert.equal(inv('Cacao, радуйся').length, 0, 'Comma inside prose must not trigger a refrain');",
    ),
    (
        "update legacy Alleluia-section expectation",
        r"assert.match(runtime, /isAkathistKontakion \? collectAkathistAlleluiaRanges\(text\) : \[\]/);",
        r"assert.match(runtime, /isAkathist \? collectAkathistAlleluiaRanges\(text\) : \[\]/);",
    ),
)


def load_raw(path):
    raw = path.read_bytes()
    bom = raw.startswith(b"\xef\xbb\xbf")
    encoding = "utf-8-sig" if bom else "utf-8"
    return raw, raw.decode(encoding), "\r\n" if b"\r\n" in raw else "\n", bom


def plan_file(path, changes):
    if not path.is_file():
        raise ValueError(f"Нет исходного файла: {path}")
    raw, text, newline, bom = load_raw(path)
    candidate = text
    tasks = []
    for label, old, new in changes:
        old, new = old.replace("\n", newline), new.replace("\n", newline)
        old_count = candidate.count(old)
        new_count = candidate.count(new)
        if old_count == 1 and new_count == 0:
            candidate = candidate.replace(old, new, 1)
            tasks.append(label)
        elif old_count == 0 and new_count == 1:
            tasks.append("уже исправлено: " + label)
        else:
            raise ValueError(
                f"ОСТАНОВЛЕНО: {path}, {label}: "
                f"old={old_count}, new={new_count}. "
                "Локальный код отличается — ничего не перезаписываем."
            )
    prefix = b"\xef\xbb\xbf" if bom else b""
    return raw, prefix + candidate.encode("utf-8"), tasks


def apply_files(root, check_only=False):
    targets = [(root / RUNTIME, RUNTIME_EDITS), (root / TEST, TEST_EDITS)]
    planned = []
    for path, edits in targets:
        original, replacement, tasks = plan_file(path, edits)
        planned.append((path, original, replacement, tasks))
    for path, original, replacement, tasks in planned:
        print(str(path))
        for task in tasks:
            print("  - " + task)
        if original == replacement:
            print("  (нет изменений)")
    changed = [(path, old, new) for path, old, new, _ in planned if old != new]
    if check_only or not changed:
        print("ПРОВЕРКА: файлы не изменены." if check_only else "Все изменения уже применены.")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_root = (Path(r"C:\m\build-backups") if os.name == "nt"
                   else root / ".reader-patch-backups")
    backup = backup_root / ("akathist-refrain-fix-" + stamp)
    backup.mkdir(parents=True, exist_ok=False)
    for path, old, _ in changed:
        relative = path.relative_to(root)
        dest = backup / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        if dest.read_bytes() != old:
            raise RuntimeError("Резервная копия не совпадает: " + str(dest))
    print("Резервные копии:", backup)

    for path, _, new in changed:
        temp = path.with_name(path.name + ".akathist-patch-tmp")
        try:
            temp.write_bytes(new)
            temp.replace(path)
        finally:
            if temp.exists():
                temp.unlink()
    print("ИСПРАВЛЕНО: 3 правила рендеринга акафистов. Контент не изменён.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Only inspect; do not change anything")
    parser.add_argument("--apply", action="store_true", help="Patch after creating backups")
    parser.add_argument("--app-dir", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    if args.check == args.apply:
        parser.error("Specify exactly one of --check or --apply")
    try:
        apply_files(args.app_dir.resolve(), check_only=args.check)
    except (OSError, UnicodeError, ValueError, RuntimeError) as exc:
        parser.exit(1, str(exc) + "\n")


if __name__ == "__main__":
    main()
