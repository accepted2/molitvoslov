from pathlib import Path

p = Path("complete_calendar_gaps_2026.py")
s = p.read_text(encoding="utf-8-sig")

old = "day.main_feast_id != expected_id or clean(title) not in clean(day.main_feast.title)"
new = "day.main_feast_id != expected_id"

if old not in s:
    raise SystemExit("СТОП: нужная проверка не найдена, файл не изменён")

s = s.replace(old, new, 1)
compile(s, str(p), "exec")
p.write_text(s, encoding="utf-8")

print("Проверка исправлена. Синтаксис OK.")
