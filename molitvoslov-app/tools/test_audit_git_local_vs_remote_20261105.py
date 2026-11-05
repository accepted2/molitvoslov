#!/usr/bin/env python3
"""Regression tests for the read-only local-vs-GitHub 3-way audit."""
import csv
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("audit_git_local_vs_remote_20261105.py")

def git(repo, *args):
    # Git on Windows may emit localized diagnostics in the console code page.
    # Decode with replacement so non-UTF8 bytes do not crash the test
    # subprocess reader thread. All fields asserted below are ASCII.
    result = subprocess.run(
        ["git", "-C", str(repo), *args], check=True,
        capture_output=True
    )
    return result.stdout.decode("utf-8", errors="replace").strip()

def write(repo, file, contents):
    path = repo / file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")

class AuditTests(unittest.TestCase):
    def make_repo(self, temp):
        repo = Path(temp) / "repo"
        repo.mkdir()
        git(repo, "init")
        git(repo, "config", "user.name", "Reader QA")
        git(repo, "config", "user.email", "test@example.invalid")
        for key in ("same", "local", "remote", "both", "data"):
            write(repo, key + ".txt", "base\n")
        git(repo, "add", ".")
        git(repo, "commit", "-m", "base")
        git(repo, "branch", "local")
        git(repo, "switch", "-c", "target")
        write(repo, "remote.txt", "remote changed\n")
        write(repo, "both.txt", "remote version\n")
        write(repo, "remote_new.txt", "added in target\n")
        git(repo, "add", ".")
        git(repo, "commit", "-m", "remote changes")
        git(repo, "switch", "local")
        write(repo, "local.txt", "my custom padding\n")
        write(repo, "both.txt", "my different padding\n")
        write(repo, "data.txt", "local prayer JSON\n")
        write(repo, "untracked.txt", "my untracked local source\n")
        return repo

    def test_reclassifies_real_disk_edits_and_preserves_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self.make_repo(tmp)
            before_status = git(repo, "status", "--porcelain", "-uall")
            before_head = git(repo, "rev-parse", "HEAD")
            before_data = (repo / "data.txt").read_bytes()
            report_dir = Path(tmp) / "reports"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--root", str(repo),
                 "--remote", "target", "--report-dir", str(report_dir)],
                check=True, capture_output=True
            )
            stdout = result.stdout.decode("utf-8", errors="replace")
            self.assertIn("BOTH_DIFFER:", stdout)
            reports = list(report_dir.glob("*.csv"))
            self.assertEqual(len(reports), 1)
            with reports[0].open(encoding="utf-8-sig", newline="") as f:
                rows = {row["path"]: row for row in csv.DictReader(f)}
            self.assertEqual(rows["same.txt"]["status"], "SAME")
            self.assertEqual(rows["local.txt"]["status"], "LOCAL_ONLY")
            self.assertEqual(rows["remote.txt"]["status"], "REMOTE_ONLY")
            self.assertEqual(rows["both.txt"]["status"], "BOTH_DIFFER")
            self.assertEqual(rows["data.txt"]["status"], "LOCAL_ONLY")
            self.assertEqual(rows["untracked.txt"]["status"], "LOCAL_ONLY")
            self.assertEqual(rows["remote_new.txt"]["status"], "REMOTE_ONLY")
            self.assertEqual(rows["both.txt"]["local_uncommitted"], "yes")
            self.assertEqual(rows["untracked.txt"]["untracked"], "yes")
            self.assertEqual(git(repo, "rev-parse", "HEAD"), before_head)
            self.assertEqual(git(repo, "status", "--porcelain", "-uall"), before_status)
            self.assertEqual((repo / "data.txt").read_bytes(), before_data)

    def test_refuses_reports_inside_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self.make_repo(tmp)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--root", str(repo),
                 "--remote", "target", "--report-dir", str(repo / "reports")],
                capture_output=True
            )
            self.assertNotEqual(result.returncode, 0)
            stdout = result.stdout.decode("utf-8", errors="replace")
            stderr = result.stderr.decode("utf-8", errors="replace")
            self.assertIn("OUTSIDE", stderr + stdout)
            self.assertFalse((repo / "reports").exists())

if __name__ == "__main__":
    unittest.main(verbosity=2)
