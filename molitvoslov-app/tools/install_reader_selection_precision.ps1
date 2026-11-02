# Precision selection: fix native calendar scrolling, broaden marker hit zones,
# show a reading magnifier above the finger in all WebView readers.
# Run from molitvoslov-app; never resets whole local screens.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch='backup/local-changes-20261028'
$python='C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if(-not (Test-Path $python)){throw "Python not found: $python"}

Write-Host '[1/5] Check existing calendar selection file and back it up'
$calendar='src/components/reader/CalendarSelectionWebText.js'
if(-not (Test-Path $calendar)){
  throw 'Previous two-handle calendar selection is missing; do not overwrite local changes.'
}
$hash=(& git hash-object $calendar | Select-Object -First 1).Trim()
if($LASTEXITCODE -ne 0){throw 'Cannot hash local calendar selection component'}
$allowed=@(
  '56d2c3087d0908e21319dae3530d07c2d8f8e137', # previous handle component
  'd8641869a8eb936625c72dac1ff48f6b80e93d4e'  # already refined
)
if($allowed -notcontains $hash){
  throw "The calendar selection file was edited locally ($hash). Refusing to overwrite it. Keep local changes and report this message."
}
$backup=Join-Path (Split-Path -Parent $root) ('build-backups\reader-selection-precision-' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item $calendar (Join-Path $backup 'CalendarSelectionWebText.js') -Force
Write-Host "Calendar selection backup: $backup"

Write-Host '[2/5] Retrieve the new magnifier component and source-safe patchers'
& git fetch origin $branch
if($LASTEXITCODE -ne 0){throw 'Git fetch failed'}
$files=@(
  'src/components/reader/CalendarSelectionWebText.js',
  'tools/patch_calendar_selection_scroll_lock.py',
  'tools/patch_reader_selection_magnifier.py',
  'tools/verify_reader_selection_precision.js'
)
& git restore --source=FETCH_HEAD -- $files
if($LASTEXITCODE -ne 0){throw 'Could not restore the precision selection files'}

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
