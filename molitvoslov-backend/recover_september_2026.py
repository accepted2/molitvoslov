import os
import subprocess
import sys
from pathlib import Path

env = os.environ.copy()
env["PYTHONIOENCODING"] = "utf-8"
env["PYTHONUTF8"] = "1"

command = [
    sys.executable,
    "-X", "utf8",
    "manage.py",
    "import_azbyka_calendar_day",
    "--range", "2026-09-22", "2026-09-30",
    "--apply",
    "--delay", "0.35",
]

log_path = Path("september_2026_recovery.log")

with log_path.open("w", encoding="utf-8") as log:
    result = subprocess.run(
        command,
        stdout=log,
        stderr=subprocess.STDOUT,
        env=env,
        encoding="utf-8",
        errors="replace",
    )

print("Код завершения:", result.returncode)
print("Лог:", log_path)

print("\nПоследние строки:")
print("\n".join(
    log_path.read_text(encoding="utf-8").splitlines()[-12:]
))

sys.exit(result.returncode)
