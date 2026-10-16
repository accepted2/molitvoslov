from pathlib import Path
p = Path("august_2026_dryrun.log")
raw = p.read_bytes()
text = raw.decode("utf-8-sig", errors="replace")
lines = text.splitlines()
for line in lines[-55:]:
    print(line)
