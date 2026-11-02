# Match calendar saved hearts to existing prayer readers while preserving local UI changes.
# Run from molitvoslov-app after the calendar text saving patch is installed.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch = 'backup/local-changes-20261028'
$python = 'C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "Python not found: $python" }

Write-Host '[1/4] Fetch corrected heart component and guarded patch'
& git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }

# Back up the shared calendar component first. Never overwrite the user's
# locally modified screens when fetching a patch from GitHub.
$original = 'src/components/reader/CalendarSaveText.js'
if (-not (Test-Path $original)) {
  throw 'Previous calendar text saving patch is missing; stop before changing files'
}
$backupDir = Join-Path (Split-Path -Parent $root) ('build-backups\calendar-heart-component-' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item $original (Join-Path $backupDir 'CalendarSaveText.js') -Force
Write-Host "Shared component backup: $backupDir"

$files = @(
  'src/components/reader/CalendarSaveText.js',
  'tools/refine_calendar_saved_hearts.py',
  'tools/verify_calendar_text_saving.js'
)
& git restore --source=FETCH_HEAD -- $files
if ($LASTEXITCODE -ne 0) { throw 'Could not restore shared component and patch tools' }

Write-Host '[2/4] Add saved section highlighting in calendar and saint detail'
& $python -X utf8 '.\tools\refine_calendar_saved_hearts.py'
if ($LASTEXITCODE -ne 0) { throw 'Calendar heart refinement stopped: check anchors/backups' }

Write-Host '[3/4] Validate fragment selection, save callbacks, JSX and icon states'
& node '.\tools\verify_calendar_text_saving.js'
if ($LASTEXITCODE -ne 0) { throw 'Calendar saving verification failed; do not release APK' }

Write-Host '[4/4] Validate working-tree formatting'
& git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace validation failed' }

Write-Host 'CALENDAR HEARTS AND FRAGMENT SAVE WIRING VERIFIED'
Write-Host 'On-device test still required: long-press a passage, choose fragment, Save, open Favorites.'
