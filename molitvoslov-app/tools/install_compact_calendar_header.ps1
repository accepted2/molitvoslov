# Move the calendar save heart into the "Life / Troparion / Kontakion" title
# row, and remove doubled outside/inside text padding. Keeps local changes.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch='backup/local-changes-20261028'
$python='C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if(-not (Test-Path $python)){throw "Python venv not found: $python"}

Write-Host '[1/4] Retrieve guarded patch and verifier; preserve all local screen files'
& git fetch origin $branch
if($LASTEXITCODE -ne 0){throw 'Git fetch failed'}
$patchFiles=@('tools/compact_calendar_heart_and_insets.py','tools/verify_compact_calendar_header.js')
& git restore --source=FETCH_HEAD -- $patchFiles
if($LASTEXITCODE -ne 0){throw 'Could not retrieve patch scripts'}

Write-Host '[2/4] Move full-save heart into the section header and reduce text margins'
& $python -X utf8 '.\tools\compact_calendar_heart_and_insets.py'
if($LASTEXITCODE -ne 0){throw 'Calendar header layout patch stopped; no additional changes applied'}

Write-Host '[3/4] Validate both screens and WebView selection syntax'
& node '.\tools\verify_compact_calendar_header.js'
if($LASTEXITCODE -ne 0){throw 'Calendar/saint header verification failed'}
& node '.\tools\verify_reader_selection_precision.js'
if($LASTEXITCODE -ne 0){throw 'Selection gesture verification failed'}

Write-Host '[4/4] Verify Git working-tree formatting'
& git diff --check
if($LASTEXITCODE -ne 0){throw 'Git whitespace check failed'}

Write-Host 'COMPACT CALENDAR HEARTS AND TEXT INSETS VERIFIED'
Write-Host 'No APK built. Check the same hagiography and the long texts in debug mode.'
