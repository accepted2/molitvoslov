"""Fault-injection test of the SQLite atomic content-delta persistence contract.

Runs entirely in a temporary SQLite file; never touches the app database,
Supabase, Render, or user data.  This tests the persistence protocol rather
than the Expo native bridge. Device-level testing remains separate.

Usage: python -m unittest discover -s tests -p test_delta_atomicity.py -v
"""
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import contextmanager


@contextmanager
def open_db(path):
    db = sqlite3.connect(path)
    try:
        with db:
            yield db
    finally:
        db.close()


SCHEMA = """
CREATE TABLE public_content_cache (
  cache_key TEXT PRIMARY KEY, version TEXT, payload TEXT, updated_at TEXT
);
CREATE TABLE content_delta_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE content_delta_calendar (
  date TEXT NOT NULL, language TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(date, language)
);
CREATE TABLE saved_items (
  id INTEGER PRIMARY KEY, text TEXT, sync_status TEXT
);
"""


def apply_batch(conn, revision, fail_at=None):
    updates = [
        ("INSERT OR REPLACE INTO public_content_cache VALUES (?, ?, ?, ?)",
         ("public-content-v1", str(revision), '{"public":2}', "now")),
        ("INSERT OR REPLACE INTO public_content_cache VALUES (?, ?, ?, ?)",
         ("bible-content-v1:rst", str(revision), '{"bible":2}', "now")),
        ("INSERT OR REPLACE INTO content_delta_calendar VALUES (?, ?, ?)",
         ("2026-10-26", "ru", '{"day":2}')),
        ("INSERT OR REPLACE INTO content_delta_state VALUES (1, ?)",
         (revision,)),
    ]
    with conn:
        for i, (sql, args) in enumerate(updates):
            conn.execute(sql, args)
            if i == fail_at:
                raise RuntimeError("simulated failure")


class AtomicContentDeltaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "app.sqlite")
        with open_db(self.path) as db:
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript(SCHEMA)
            db.execute("INSERT INTO saved_items VALUES (1, 'private bookmark', 'pending')")
            db.execute("INSERT INTO content_delta_state VALUES (1, 1)")
            db.execute(
                "INSERT INTO public_content_cache VALUES (?, ?, ?, ?)",
                ("public-content-v1", "1", '{"public":1}', "old"),
            )
            db.execute(
                "INSERT INTO public_content_cache VALUES (?, ?, ?, ?)",
                ("bible-content-v1:rst", "1", '{"bible":1}', "old"),
            )
            db.execute(
                "INSERT INTO content_delta_calendar VALUES (?, ?, ?)",
                ("2026-10-26", "ru", '{"day":1}'),
            )

    def tearDown(self):
        self.temp.cleanup()

    def snapshot(self):
        with open_db(self.path) as db:
            return (
                db.execute("SELECT cursor FROM content_delta_state").fetchall(),
                db.execute(
                    "SELECT cache_key, payload FROM public_content_cache ORDER BY cache_key"
                ).fetchall(),
                db.execute("SELECT payload FROM content_delta_calendar").fetchall(),
                db.execute("SELECT * FROM saved_items").fetchall(),
            )

    def test_rollback_after_each_failed_step(self):
        original = self.snapshot()
        for step in range(4):
            with self.assertRaises(RuntimeError):
                with open_db(self.path) as db:
                    apply_batch(db, 2, fail_at=step)
            self.assertEqual(self.snapshot(), original)

    def test_process_kill_recovery_and_replay(self):
        original = self.snapshot()
        program = """
import os, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute('BEGIN IMMEDIATE')
db.execute('UPDATE public_content_cache SET payload = ? WHERE cache_key = ?',
           ('{"public":99}', 'public-content-v1'))
db.execute('UPDATE content_delta_state SET cursor = 99')
os._exit(17)
"""
        result = subprocess.run([sys.executable, "-c", program, self.path], check=False)
        self.assertEqual(result.returncode, 17)
        self.assertEqual(self.snapshot(), original)
        with open_db(self.path) as db:
            apply_batch(db, 2)
            apply_batch(db, 2)
        cursor, content, calendar, private = self.snapshot()
        self.assertEqual(cursor, [(2,)])
        self.assertEqual(calendar, [('{"day":2}',)])
        self.assertEqual(len(content), 2)
        self.assertEqual(private, original[3])


if __name__ == "__main__":
    unittest.main()
