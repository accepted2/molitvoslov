#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Offline regression tests for the two-collection import. No network needed."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "import_ioann_kronshtadtsky_collections_20261118.py"
spec = importlib.util.spec_from_file_location("prayer_import", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture_html():
    headings = "".join(
        f'<h2><a href="#top">^</a> {name}<sup>1</sup></h2>'
        f'<p>Господи, сотвори милость Твою над нами. '
        f'Да будет мир, да утвердится вера и любовь. Здесь отдельная молитва номер {i}.</p>'
        for i, name in enumerate(module.EXPECTED_TITLES)
    )
    sections = "".join(
        f'<h3>Том {i}</h3><p>Господи, помилуй нас. '
        f'Это молитвенное размышление. ' + ("Помоги нам творить волю Твою. " * 18) + '</p>'
        for i in range(1, 4)
    )
    return f'<html><body><nav>Not the article</nav><main><article><h1>Молитвы св. праведного Иоанна Кронштадтского</h1>{headings}' \
        f'<h2>Иные молитвы св. праведного Иоанна Кронштадтского из книги «Моя жизнь во Христе»</h2>{sections}' \
        '</article></main></body></html>'


class ImportTests(unittest.TestCase):
    def test_extract_two_sections(self):
        prayers, volumes = module.extract_sections(fixture_html())
        self.assertEqual(len(prayers), 15)
        self.assertEqual(len(volumes), 3)
        self.assertTrue(prayers[0]['text'].startswith('Господи'))
        self.assertTrue(volumes[-1]['text'].startswith('Господи'))

    def test_abort_when_page_is_incomplete(self):
        with self.assertRaisesRegex(ValueError, "15 titled prayers"):
            module.extract_sections(fixture_html().replace('<h2><a href="#top">^</a> Молитва утренняя', '<h5>Молитва утренняя'))

    def test_no_mutations_in_dry_run_and_idempotence(self):
        with TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            content_file = tmp / "offlineContent.json"
            manifest = tmp / "first.js"
            original = {
                'schema_version': 1,
                'content_version': 'original',
                'generated_at': '2026-11-18',
                'categories': [
                    {'id': 100, 'slug': 'raznye-molitvy', 'name': 'Разные молитвы', 'parent': None, 'order': 0}
                ],
                'category_texts': {'raznye-molitvy': []},
                'texts': {'preexisting': {'id': 1, 'slug': 'preexisting', 'title': 'Existing', 'translation': 'No changes'}},
                'prayer_rules': {'list': [], 'by_slug': {}},
            }
            content_file.write_text(json.dumps(original, ensure_ascii=False, indent=2), encoding='utf8')
            manifest.write_text('const PRAYERS = ' + json.dumps([
                {'slug': 'first-' + str(i), 'title': 'Gratitude ' + str(i), 'text': 'Благодарю Господа. ' * 12}
                for i in range(1, 4)
            ], ensure_ascii=False) + ';\nconst fail =', encoding='utf8')
            fake_args = type('Args', (), {'dry_run': True, 'second_html': None})()
            with patch.object(module, 'CONTENT', content_file), \
                 patch.object(module, 'FIRST_IMPORT', manifest), \
                 patch.object(module, 'ROOT', tmp), \
                 patch.object(module, 'fetch_page', return_value=fixture_html()), \
                 contextlib.redirect_stdout(io.StringIO()):
                before = content_file.read_bytes()
                module.main(fake_args)
                self.assertEqual(content_file.read_bytes(), before, "Dry run changed offline catalog")
                fake_args.dry_run = False
                module.main(fake_args)
                after = json.loads(content_file.read_text(encoding='utf8'))
                self.assertEqual(after['texts']['preexisting'], original['texts']['preexisting'])
                self.assertEqual(len(after['category_texts'][module.GRATITUDE_SLUG]), 3)
                self.assertEqual(len(after['category_texts'][module.MAIN_SLUG]), 15)
                self.assertEqual(len(after['category_texts'][module.VOLUME_SLUG]), 3)
                installed = content_file.read_bytes()
                module.main(fake_args)
                self.assertEqual(installed, content_file.read_bytes(), "Duplicate run changed existing content")
                self.assertEqual(len(list((tmp / 'build-backups').glob('*/offlineContent.json'))), 1)


if __name__ == '__main__':
    unittest.main()
