from pathlib import Path

path = Path("august_2026_dryrun.log")
raw = path.read_bytes()

print("Размер лога:", len(raw), "байт")
print("Первые байты:", repr(raw[:60]))

for encoding in ("utf-16", "utf-8-sig", "cp866", "cp1251"):
    print("\n" + "=" * 15 + " " + encoding + " " + "=" * 15)
    try:
        content = raw.decode(encoding)
        print("\n".join(content.splitlines()[-12:]))
    except UnicodeError as exc:
        print("Ошибка декодирования:", exc)
