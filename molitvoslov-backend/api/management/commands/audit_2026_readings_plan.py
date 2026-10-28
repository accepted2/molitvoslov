"""Generate complete human-readable review of Azbyka vs current SQLite using a frozen prepare plan."""
import html
import json
from collections import Counter
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from api.management.commands.rebuild_2026_readings import snapshot, digest


def normalize(value):
    return "".join(value.split()).replace("—", "–").replace("-", "–")


def norm_no_zach(value):
    import re
    return normalize(re.sub(r"\\([^)]*зач[^)]*\\)", "", value, flags=re.I))


def row_key(row):
    return row["kind"], normalize(row["title"])


class Command(BaseCommand):
    help = "Audit all days and passages from 2026 rebuild plan against SQLite; never writes to database"

    def add_arguments(self, parser):
        parser.add_argument("--plan", type=Path, required=True)
        parser.add_argument("--out", type=Path, default=Path("reports/2026_readings_audit.html"))

    def handle(self, *args, **opts):
        plan_path = opts["plan"]
        if not plan_path.is_file():
            raise CommandError("Plan not found")
        plan = json.loads(plan_path.read_text(encoding="utf8"))
        current = snapshot()
        if plan.get("year") != 2026 or len(plan.get("proposed", {})) != 365:
            raise CommandError("Invalid or incomplete plan")
        if digest(current) != plan.get("baseline_sha256"):
            raise CommandError("SQLite differs from plan baseline. Create a fresh --prepare first.")
        old_by_date = {}
        for row in current:
            old_by_date.setdefault(row["date"], []).append(row)
        sections = []
        stats = Counter()
        for day, proposed in sorted(plan["proposed"].items()):
            old = old_by_date.get(day, [])
            old_keys = {row_key(r) for r in old}
            new_keys = {row_key(r) for r in proposed}
            removed = old_keys - new_keys
            added = new_keys - old_keys
            if not removed and not added and len(old) == len(proposed):
                stats["exact"] += 1
                continue
            stats["changed"] += 1
            stats["old_exclusive"] += len(removed)
            stats["new_exclusive"] += len(added)
            # Mark probable formatting differences, but never automatically approve.
            new_without_zach = {(r["kind"], norm_no_zach(r["title"])) for r in proposed}
            old_without_zach = {(r["kind"], norm_no_zach(r["title"])) for r in old}
            tr = []
            tr.append(f'<h2 id="d{day}">{day} — <a href="https://azbyka.ru/days/{day}">Открыть Азбуку</a></h2>')
            tr.append(f'<p>SQLite: {len(old)}; новый парсер: {len(proposed)}</p>')
            tr.append('<table><thead><tr><th>Сейчас в SQLite</th><th>Новая выгрузка Азбуки</th></tr></thead><tbody><tr><td>')
            for r in old:
                k = row_key(r)
                cls = "missing" if k in removed else "same"
                hint = " (возможно только оформление)" if (r["kind"], norm_no_zach(r["title"])) in new_without_zach and k in removed else ""
                tr.append(f'<div class="{cls}">{html.escape(r["kind"])} | {html.escape(r["label"])} | {html.escape(r["title"])}{hint}</div>')
            tr.append('</td><td>')
            for r in proposed:
                k = row_key(r)
                cls = "added" if k in added else "same"
                hint = " (возможно только оформление)" if (r["kind"], norm_no_zach(r["title"])) in old_without_zach and k in added else ""
                tr.append(f'<div class="{cls}">{html.escape(r["kind"])} | {html.escape(r["label"])} | {html.escape(r["title"])}{hint}</div>')
            tr.append('</td></tr></tbody></table>')
            sections.append("".join(tr))
        out = opts["out"]
        out.parent.mkdir(parents=True, exist_ok=True)
        styles = 'body{font:15px system-ui,sans-serif;max-width:1450px;margin:30px auto;padding:0 16px}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #aaa;padding:12px;vertical-align:top}td div{margin:0 0 8px;padding:6px;border-radius:3px;overflow-wrap:anywhere}.missing{background:#ffdfdf}.added{background:#e1f1df}.same{background:#eee}h2{margin-top:38px}'
        out.write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><title>2026 readings audit</title><style>'+styles+'</style><body><h1>Сверка чтений за 2026 год</h1><p>Красный: только в SQLite; зелёный: только в новом парсинге. Это не решение об удалении. Серый: совпадает.</p><p>Источник: сохранённый план, без нового сетевого запроса. Данные не изменены.</p>'+"".join(sections)+'</body></html>',encoding="utf8")
        self.stdout.write(f"AUDIT: exact={stats['exact']} changed={stats['changed']} old_only={stats['old_exclusive']} source_only={stats['new_exclusive']}")
        self.stdout.write(f"HTML: {out.resolve()}")
        self.stdout.write("SQLite unchanged.")
