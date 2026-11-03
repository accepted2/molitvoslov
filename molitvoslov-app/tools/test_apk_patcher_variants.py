#!/usr/bin/env python3
"""Regression tests for safely patching customized SQLiteProvider names.

These tests do not modify app files or databases.
"""
import unittest
from patch_bundled_apk_mode import patch_search


def screen(attr, manifest=False):
    declaration = (
        "import searchSeedBuild from '../data/searchSeedBuild.json';\n"
        if manifest else ""
    )
    return (
        "import React from 'react';\n"
        "import {SQLiteProvider, useSQLiteContext} from 'expo-sqlite';\n"
        + declaration +
        "// 🕯 Проверка сохранения всех других правок\n"
        "export const SearchScreen = () => (\n"
        "  <SQLiteProvider\n"
        "    " + attr + "\n"
        "    assetSource={{assetId: require('../data/search_seed.db')}}\n"
        "  ><SomeCustomLocalComponent /></SQLiteProvider>\n"
        ");\n"
    )


class SearchScreenPatchTests(unittest.TestCase):
    def assertPatched(self, source):
        changed = patch_search(source, "")
        self.assertEqual(changed.count("databaseName={searchSeedBuild.database_name}"), 1)
        self.assertEqual(changed.count("import searchSeedBuild from '../data/searchSeedBuild.json';"), 1)
        self.assertIn("SomeCustomLocalComponent", changed)
        self.assertIn("🕯 Проверка сохранения", changed)
        self.assertEqual(patch_search(changed, ""), changed)

    def test_plain_historical_fingerprint(self):
        self.assertPatched(screen('databaseName="molitvoslov_search_v10_b094e3e635a9.db"'))

    def test_custom_fingerprint_with_punctuation(self):
        self.assertPatched(screen('databaseName="search-v10_local.2026_11_03.db"'))

    def test_single_quote_jsx(self):
        self.assertPatched(screen("databaseName='search-v10-local.db'"))

    def test_literal_expression(self):
        self.assertPatched(screen('databaseName={"search-v10-local.db"}'))

    def test_template_expression(self):
        tick = chr(96)
        self.assertPatched(screen('databaseName={' + tick + 'search-v10-local.db' + tick + '}'))

    def test_already_imported_manifest(self):
        self.assertPatched(screen('databaseName="legacy.db"', manifest=True))

    def test_custom_dynamic_database_attribute(self):
        self.assertPatched(screen("databaseName={chooseDatabase()}"))

    def test_crlf_windows_does_not_double_carriage_returns(self):
        source = screen('databaseName="windows.db"').replace("\\n", "\\r\\n")
        changed = patch_search(source, "")
        self.assertNotIn("\\r\\r\\n", changed)
        self.assertEqual(patch_search(changed, ""), changed)

    def test_no_sqlite_provider(self):
        with self.assertRaisesRegex(ValueError, "Expected one SQLiteProvider"):
            patch_search("import React from 'react'; export default () => <Text/>;", "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
