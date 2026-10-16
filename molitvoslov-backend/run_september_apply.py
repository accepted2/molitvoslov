import subprocess
import sys
from pathlib import Path

command = [
    sys.executable,
    "manage.py",
    "import_azbyka_calendar_day",
    "--range",
    "2026-09-01",
    "2026-09-30",
    "--apply",
    "--delay",
    "0.35",
]

log_path = Path("september_2026_apply.log")

with log_path.open("w", encoding="utf-8") as log:
    result = subprocess.run(
        command,
        stdout=log,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
    )

print("Код завершения:", result.returncode)
print("Лог:", log_path.resolve())

if result.returncode != 0:
    print("\nПоследние строки лога:")
    print("\n".join(log_path.read_text(encoding="utf-8").splitlines()[-25:]))

sys.exit(result.returncode)
