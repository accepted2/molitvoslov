from pathlib import Path
import ast
import re

path = Path("finish_calendar_nov_dec_2026.py")
source = path.read_text(encoding="utf-8-sig")

# Исправляем объявление функции, а не отдельные вызовы
pattern = r"(?m)^(def\s+say\s*\()([^)]*)(\)\s*:)"


def replace(match):
    args = match.group(2)
    if "**kwargs" in args:
        return match.group(0)
    return match.group(1) + args.rstrip().rstrip(",") + ", **kwargs" + match.group(3)


fixed, count = re.subn(pattern, replace, source, count=1)

if count != 1:
    raise RuntimeError("Не найдено объявление say(). Скрипт не изменён.")

ast.parse(fixed)
path.write_text(fixed, encoding="utf-8")

print("Функция say() исправлена")
