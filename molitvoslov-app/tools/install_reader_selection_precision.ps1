# Precision selection: fix native calendar scrolling, broaden marker hit zones,
# show a reading magnifier above the finger in all WebView readers.
# Run from molitvoslov-app; never resets whole local screens.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch='backup/local-changes-20261028'
$python='C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if(-not (Test-Path $python)){throw "Python not found: $python"}

Write-Host '[1/5] Validate and back up existing calendar selection file (no Git hash)'
$calendar='src/components/reader/CalendarSelectionWebText.js'
if(-not (Test-Path $calendar)){
  throw 'Previous two-handle calendar selection is missing; do not overwrite local changes.'
}
# This source was already restored during the preceding attempt (stage 2).
# Preserve the local file rather than hashing it or checking it out again.
# A content/feature preflight avoids Git/CRLF/PowerShell hash differences.
$source=[System.IO.File]::ReadAllText((Resolve-Path $calendar).Path,[System.Text.Encoding]::UTF8)
$required=@(
  'const selectionScript = String.raw',
  "type:'scroll-lock',locked:true",
  'onSelectionLockChange',
  'selection-lens',
  'setPointerCapture',
  'offsetX:edge?'
)
foreach($token in $required){
  if(-not $source.Contains($token)){
    throw "Existing calendar selection component lacks a required feature: $token. Refusing to overwrite local edits."
  }
}
$backup=Join-Path (Split-Path -Parent $root) ('build-backups\reader-selection-precision-' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item $calendar (Join-Path $backup 'CalendarSelectionWebText.js') -Force
Write-Host "Calendar selection backup: $backup"

Write-Host '[2/5] Fetch corrected source-safe patchers; preserve local selection component'
& git fetch origin $branch
if($LASTEXITCODE -ne 0){throw 'Git fetch failed'}
$files=@(
  'tools/patch_calendar_selection_scroll_lock.py',
  'tools/patch_reader_selection_magnifier.py',
  'tools/verify_reader_selection_precision.js'
)
& git restore --source=FETCH_HEAD -- $files
if($LASTEXITCODE -ne 0){throw 'Could not restore precision patch tools'}

Write-Host '[3/5] Lock native parent/nested scrolling while calendar text is selected'
& $python -X utf8 '.\tools\patch_calendar_selection_scroll_lock.py'
if($LASTEXITCODE -ne 0){throw 'Native selection scroll lock patch failed; do not build'}

Write-Host '[4/5] Widen marker hit targets and show per-character magnifier'
& $python -X utf8 '.\tools\patch_reader_selection_magnifier.py'
if($LASTEXITCODE -ne 0){throw 'Reader selection magnifier patch failed; do not build'}

Write-Host '[5/5] Validate JSX, WebView JS, save callbacks and Git formatting'
& node '.\tools\verify_reader_selection_precision.js'
if($LASTEXITCODE -ne 0){throw 'Selection precision verification failed; do not build'}
& git diff --check
if($LASTEXITCODE -ne 0){throw 'Git whitespace validation failed'}

Write-Host 'READER SELECTION PRECISION AND PARENT SCROLL LOCK VERIFIED'
Write-Host 'Test long-press + both handles in calendar life, troparion, prayer rules, Psalter and Bible.'
Write-Host 'APK was not rebuilt.'
