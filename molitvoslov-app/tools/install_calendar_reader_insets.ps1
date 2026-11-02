# Fix text proximity to the top gradient and left/right edges of
# calendar lives, troparia and kontakia while preserving all local changes.
$ErrorActionPreference = 'Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$python='C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
$branch='backup/local-changes-20261028'

if (-not (Test-Path $python)) { throw "Backend Python is missing: $python" }
Write-Host '[1/3] Fetch guarded text-inset patch'
& git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Cannot fetch patch from GitHub' }
& git restore --source=FETCH_HEAD -- 'tools/fix_calendar_reader_insets.py'
if ($LASTEXITCODE -ne 0) { throw 'Cannot restore text-inset patch' }

Write-Host '[2/3] Adjust inner HTML spacing without changing hearts or scrolling'
& $python -X utf8 '.\tools\fix_calendar_reader_insets.py'
if ($LASTEXITCODE -ne 0) { throw 'Reader inset patch failed. Existing source backed up if changed.' }

Write-Host '[3/3] Verify syntax, gesture runtime and working tree'
& node '.\tools\verify_reader_selection_precision.js'
if ($LASTEXITCODE -ne 0) { throw 'Reader syntax/selection validation failed' }
& git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Git whitespace validation failed' }

Write-Host 'CALENDAR READER TOP AND SIDE INSETS VERIFIED'
Write-Host 'Open a life, scroll it, and check the text under the upper fade.'
