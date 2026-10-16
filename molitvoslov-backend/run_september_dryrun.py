import subprocess
import sys
from pathlib import Path

command = [
    sys.executable,
    "manage.py",
    "import_azbyka_calendar_day",
    "--range", "2026-09-01", "2026-09-30",
    "--dry-run",
    "--delay", "0.35",
]

with Path("september_2026_dryrun.log").open("w", encoding="utf-8") as log:
    result = subprocess.run(
        command,
        stdout=log,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
    )

sys.exit(result.returncode)
