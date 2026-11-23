#!/usr/bin/env python3
"""Check for *new* migration drift while keeping known main-branch drift visible.

The calendar integration branch forks from main, where two unrelated historical
model changes were not yet recorded in migrations. The working WIP branch already
records both in 0047_align_content_models.py. Do NOT add a duplicate migration
0048 here: 0046/0047 names also collide with different WIP migrations.

This check is read-only. It compares on-disk migration state with current models,
fails for any newly detected change and reports the two pre-existing changes as
outstanding, not as a clean migration check.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Running a script by path puts tools/ (not the backend project root) on sys.path.
# Match manage.py import resolution without relying on PYTHONPATH or cwd.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django  # noqa: E402
django.setup()

from django.apps import apps  # noqa: E402
from django.db.migrations.autodetector import MigrationAutodetector  # noqa: E402
from django.db.migrations.loader import MigrationLoader  # noqa: E402
from django.db.migrations.operations.fields import AlterField  # noqa: E402
from django.db.migrations.questioner import NonInteractiveMigrationQuestioner  # noqa: E402
from django.db.migrations.state import ProjectState  # noqa: E402

# Existing since main (also covered by the WIP branch's 0047_align_content_models.py).
KNOWN_MAIN_DRIFT = {
    ("api", "calendarreading", "kind"),
    ("api", "text", "content"),
}

loader = MigrationLoader(None)
changes = MigrationAutodetector(
    loader.project_state(),
    ProjectState.from_apps(apps),
    NonInteractiveMigrationQuestioner(),
).changes(graph=loader.graph, trim_to_apps={"api"})

# Scope the drift gate to our application's migration state. Django's
# contributing apps (admin/auth/sessions/authtoken) have separate migrations
# and were mistakenly reported as unexpected changes by the first version.
detected = set()
for app_label, migrations in changes.items():
    if app_label != "api":
        continue
    for migration in migrations:
        for operation in migration.operations:
            if isinstance(operation, AlterField):
                detected.add((app_label, operation.model_name.lower(), operation.name))
            else:
                detected.add((app_label, type(operation).__name__, "<operation>"))

unexpected = detected - KNOWN_MAIN_DRIFT
if unexpected:
    for value in sorted(unexpected):
        print("UNEXPECTED MIGRATION DRIFT: " + ".".join(value), file=sys.stderr)
    sys.exit(1)

if detected:
    for value in sorted(detected):
        print("KNOWN PRE-EXISTING MIGRATION DRIFT: " + ".".join(value))
    print("NOT MIGRATION-CLEAN: defer these two baseline fields to the existing WIP")
    print("0047_align_content_models.py during the final cross-branch integration.")
else:
    print("PASS: Django migration state matches the models; no drift detected.")

print("PASS: No new unreviewed schema drift in calendar integration branch.")
