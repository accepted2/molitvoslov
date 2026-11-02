# Safely add calendar/save-selection features to existing local Molitvoslov sources.
# Run from the app root. This does not run Gradle or modify an APK.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch = 'backup/local-changes-20261028'
$python = 'C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "Python not found: $python" }

Write-Host '[1/4] Fetch shared saving component and guarded integration patch'
& git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }

# Do not overwrite screens or services: the user's working tree may have
# newer layout/search changes that have never been committed to this branch.
$files = @(
  'src/components/reader/CalendarSaveText.js',
  'tools/apply_calendar_text_saving.py',
  'tools/verify_calendar_text_saving.js'
)
& git restore --source=FETCH_HEAD -- $files
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch calendar saving patch files' }

Write-Host '[2/4] Apply to calendar, saint card, own prayers and Favorites'
& $python -X utf8 '.\tools\apply_calendar_text_saving.py'
if ($LASTEXITCODE -ne 0) { throw 'Calendar saving patch failed; APK build blocked' }

Write-Host '[3/4] Check JavaScript syntax, JSX imports and routing anchors'
& node '.\tools\verify_calendar_text_saving.js'
if ($LASTEXITCODE -ne 0) { throw 'Calendar saving verification failed; APK build blocked' }

Write-Host '[4/4] Check working tree formatting'
& git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Git whitespace check failed' }

Write-Host 'CALENDAR TEXT SAVING PATCH INSTALLED AND SYNTAX VERIFIED'
Write-Host 'Calendar full-text saves, fragment selection and personal-prayer selection ready for on-device testing.'
Write-Host 'No APK was built; test selection/scroll and Favorites before releasing.'
