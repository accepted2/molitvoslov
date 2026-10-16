from pathlib import Path
import re

text = Path("september_2026_dryrun.log").read_text(
    encoding="utf-8"
)

dates = sorted(set(re.findall(r"2026-09-\d{2}", text)))
print("Проверено дат:", len(dates))

for target in ("2026-09-11", "2026-09-21", "2026-09-27"):
    pos = text.find(target)
    print("\n===", target, "===")
    if pos < 0:
        print("Дата не найдена")
        continue

    section = text[pos:]
    section = re.split(
        r"\n=+.*2026-09-\d{2}",
        section,
        maxsplit=1
    )[0]

    for line in section.splitlines():
        if "MAIN " in line or "Ошибок парсинга/сети:" in line:
            print(line)

print("\nПоследние строки:")
print("\n".join(text.splitlines()[-5:]))
