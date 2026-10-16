"""Safely patch current Molitvoslov Azbyka parser; idempotent and backs up source."""
from pathlib import Path
from datetime import datetime
import ast
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2] if len(sys.argv)<2 else Path(sys.argv[1]).resolve()
TARGET = ROOT / 'api' / 'azbyka_calendar_readings.py'
if not TARGET.is_file():
    sys.exit(f'Не найден {TARGET}. Запускайте из backend или укажите полный путь backend.')
s = TARGET.read_text(encoding='utf-8')
MARKER = '# MOLITVOSLOV_DATE_GUARD_V1'
if MARKER in s:
    print('Защита уже установлена, изменений нет.')
    sys.exit(0)
needle='        response.raise_for_status()\n        source_text = extract_readings_text(response.text)'
if s.count(needle)!=1:
    sys.exit('Версия парсера отличается от ожидаемой: изменения НЕ внесены.')
helper='''\n\n# MOLITVOSLOV_DATE_GUARD_V1\ndef validate_response_date(response, requested_day):\n    """Reject redirected or canonically mislabeled days; absence of hints is not proof."""\n    from urllib.parse import urlsplit\n    from bs4 import BeautifulSoup\n    import re\n\n    expected = requested_day.isoformat()\n    def found_date(value):\n        if not value:\n            return None\n        path = urlsplit(str(value)).path.rstrip("/")\n        match = re.search(r"/(?:days/)?(\\d{4}-\\d{2}-\\d{2})$", path)\n        return match.group(1) if match else None\n\n    final_url = getattr(response, "url", "")\n    final_date = found_date(final_url)\n    if final_date and final_date != expected:\n        raise AzbykaReadingsError(\n            f"DATE_MISMATCH: запрошено {expected}, ответ URL {final_url}"\n        )\n    soup = BeautifulSoup(response.text, "lxml")\n    candidates = []\n    for tag in soup.select('link[rel="canonical"][href], meta[property="og:url"][content]'):\n        candidate = found_date(tag.get("href") or tag.get("content"))\n        if candidate:\n            candidates.append(candidate)\n    for value in candidates:\n        if value != expected:\n            raise AzbykaReadingsError(\n                f"DATE_MISMATCH: запрошено {expected}, canonical/og:url {value}"\n            )\n    if len(set(candidates)) > 1:\n        raise AzbykaReadingsError(f"DATE_MISMATCH: конфликт адресов страницы {candidates}")\n\n'''
# Insert before fetch function to be runtime-resolved and keep imports local.
position='def fetch_day_readings(day, session=None, timeout=20):'
if s.count(position)!=1:
    sys.exit('Не найден ожидаемый fetch_day_readings. Изменений нет.')
s=s.replace(position,helper+position,1)
s=s.replace(needle,'        response.raise_for_status()\n        validate_response_date(response, day)\n        source_text = extract_readings_text(response.text)',1)
ast.parse(s)
backup=TARGET.with_suffix('.py.bak_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
shutil.copy2(TARGET,backup)
TARGET.write_text(s,encoding='utf-8')
print('Защита URL/canonical установлена. Резервная копия:',backup)
