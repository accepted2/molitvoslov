# Replace the calendar one-word selection with two draggable handles.
# Remove only unwanted whole-section coloring; leave the heart icon intact.
# Run from molitvoslov-app after the calendar saving patches are installed.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch='backup/local-changes-20261028'
$python='C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if(-not (Test-Path $python)){throw "Python not found: $python"}

Write-Host '[1/4] Fetch new selection component and guarded local patch'
& git fetch origin $branch
if($LASTEXITCODE -ne 0){throw 'Git fetch failed'}

$files=@(
 'src/components/reader/CalendarSelectionWebText.js',
 'tools/fix_calendar_selection_handles.py',
 'tools/verify_calendar_selection_handles.js'
)
& git restore --source=FETCH_HEAD -- $files
if($LASTEXITCODE -ne 0){throw 'Cannot restore selection files from GitHub'}

Write-Host '[2/4] Patch local calendar, saint and selection components (backups enabled)'
& $python -X utf8 '.\tools\fix_calendar_selection_handles.py'
if($LASTEXITCODE -ne 0){throw 'Selection fix stopped; do not build until resolved'}

Write-Host '[3/4] Verify JSX and JavaScript inside the WebView'
& node '.\tools\verify_calendar_selection_handles.js'
if($LASTEXITCODE -ne 0){throw 'Selection verification failed; do not build APK'}

Write-Host '[4/4] Check working tree'
& git diff --check
if($LASTEXITCODE -ne 0){throw 'Git diff whitespace check failed'}

Write-Host 'CALENDAR HEART-ONLY SAVE AND TWO-HANDLE SELECTION PATCH COMPLETE'
Write-Host 'Test on Android: expand a life, long press, drag both markers, save a multiword fragment, and scroll.'
