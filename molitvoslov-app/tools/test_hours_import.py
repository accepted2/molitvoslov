#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""From molitvoslov-app: python -X utf8 tools/test_hours_import.py"""
import importlib.util
import sys
from pathlib import Path

script = Path(__file__).with_name("import_hours_texts.py")
spec = importlib.util.spec_from_file_location("import_hours_texts", script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def assert_contains(value, sample):
    assert sample in value, (sample, value)

rows = "".join(
    "<tr><td><h3>Псалом {}</h3><p>Церковнославянский абзац {}.</p>"
    "<p>Богородице, спаси нас.</p></td>"
    "<td><h3>Псалом {}</h3><p>Русский абзац {}.</p></td></tr>".format(i, i, i, i)
    for i in range(3)
)
simple_html = ("<html><body><article><table><tr><th>Церковнославянский</th>"
               "<th>Русский</th></tr>" + rows + "</table></article></body></html>")
simple, row_count = mod.parse_paired(simple_html, default_hour=1)
assert row_count == 3, row_count
assert set(simple) == {1}, simple
assert len(simple[1]) == 3, simple
assert_contains(simple[1][0]["rows"][0]["church"], "Церковнославянский абзац")
assert_contains(simple[1][0]["rows"][0]["russian"], "Русский абзац")
assert "Псалом 0" == simple[1][0]["title"]

parts = []
for index, numeral in enumerate(("ПЕРВЫЙ", "ТРЕТИЙ", "ШЕСТОЙ", "ДЕВЯТЫЙ")):
    parts.append(
        "<tr><td colspan='2'><h2>ЧАС {}</h2></td></tr>".format(numeral)
    )
    for i in range(3):
        parts.append(
            "<tr><td><p>ЦС {} молитва {} всем чтецам.</p></td>"
            "<td><p>РУС {} молитва {} всем чтецам.</p></td></tr>".format(
                index, i, index, i
            )
        )
royal_html = "<html><body><article><table>{}</table></article></body></html>".format(
    "".join(parts)
)
royal, _ = mod.parse_paired(royal_html, group="royal-nativity")
assert set(royal) == {1, 3, 6, 9}, royal.keys()
assert all(len(royal[number][0]["rows"]) == 3 for number in royal), royal

lenten_html = "<html><body><article>" + "".join(
    "<h2>Час {}</h2>".format(title) +
    "".join("<p>Господи, помилуй нас, и спаси души наша {}.</p>".format(i)
            for i in range(5))
    for title in ("первый", "третий", "шестой", "девятый")
) + "<h2>Изобразительные</h2><p>Не должно попасть в девятый час.</p></article></body></html>"
lenten = mod.parse_single_lenten(lenten_html)
assert set(lenten) == {1, 3, 6, 9}, lenten
assert len(lenten[9][0]["rows"]) == 5, lenten[9]

paschal_html = (
    "<html><body><article><h2>Текст Часов Пасхи</h2>"
    "<p>Христос воскресе из мертвых, смертию смерть поправ.</p>"
    "<p>Перевод: Христос воскрес из мёртвых и победил смерть.</p>"
    "<p>Господи, помилуй нас и спаси души наша.</p>"
    "<h2>Литература</h2><p>Вне текста</p></article></body></html>"
)
paschal = mod.parse_paschal(paschal_html)
assert len(paschal) == 1 and len(paschal[0]["rows"]) == 2, paschal
assert_contains(paschal[0]["rows"][0]["russian"], "Христос воскрес")
assert "Вне текста" not in str(paschal)
print("PASS: hours HTML parser — bilingual, royal 4-way split, Lent, Easter, heading cleanup")
