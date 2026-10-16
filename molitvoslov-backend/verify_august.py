from pathlib import Path
import re

raw = Path("august_2026_dryrun.log").read_bytes()
text = raw.decode("utf-16")

# Восстанавливаем кириллицу, ошибочно прочитанную как CP866.
def repair(line):
    try:
        return line.encode("cp866").decode("utf-8")
    except (UnicodeError, ValueError):
        return line

text = "\n".join(repair(line) for line in text.splitlines())

Path("august_2026_dryrun_repaired.log").write_text(
    text, encoding="utf-8"
)

for date in ("2026-08-19", "2026-08-28"):
    pattern = (
        r"(?ms)^===== \[\d+/31\] "
        + re.escape(date)
        + r" =====$"
        + r"(.*?)(?=^===== \[|\Z)"
    )
    match = re.search(pattern, text)

    print("\n" + "=" * 45)
    print("ДАТА:", date)

    if not match:
        print("Раздел не найден")
        continue

    lines = match.group(1).splitlines()
    for line in lines:
        if "MAIN " in line or "Ошибок парсинга/сети:" in line:
            print(line)

print("\nИсправленный лог: august_2026_dryrun_repaired.log")
