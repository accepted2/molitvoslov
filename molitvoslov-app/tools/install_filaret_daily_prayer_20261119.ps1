<#
Install the photographed St Philaret daily prayer into the existing local
Molitvoslov offline catalog, then rebuild and verify the exact search index.
No installed APK, Django or personal data is changed. All original JSON and
search seed files are backed up by the individual safety-gated scripts.

Run in molitvoslov-app:
  & .\tools\install_filaret_daily_prayer_20261119.ps1 -PythonExe $pythonExe
#>
param([string]$PythonExe = '')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function CheckExit([string]$name) {
  if ($LASTEXITCODE -ne 0) {
    throw "$name FAILED, code $LASTEXITCODE. No APK was built or installed."
  }
}

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  $PythonExe = $env:MOLITVOSLOV_PYTHON
}
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  $detected = & py -3.14 -c 'import sys; print(sys.executable)'
  if ($LASTEXITCODE -eq 0) { $PythonExe = [string]$detected }
}
if ([string]::IsNullOrWhiteSpace($PythonExe) -or
    -not (Test-Path -LiteralPath $PythonExe)) {
  throw 'Pass -PythonExe with a valid python.exe path.'
}
$PythonExe = (Resolve-Path -LiteralPath $PythonExe).Path
$env:MOLITVOSLOV_PYTHON = $PythonExe
& $PythonExe --version
CheckExit 'Python executable'

Write-Host '[1/5] Check the prayer transcription and duplication safeguards'
& $PythonExe -X utf8 .\tools\test_filaret_daily_prayer_20261119.py
CheckExit 'St Philaret prayer unit tests'
& $PythonExe -X utf8 .\tools\import_filaret_daily_prayer_20261119.py --dry-run
CheckExit 'St Philaret offline dry run'

Write-Host '[2/5] Check the search generator without editing it'
node .\tools\apply_filaret_daily_prayer_search_20261119.js --dry-run
CheckExit 'Filaret search patch dry run'

Write-Host '[3/5] Install one prayer in Разные молитвы and update canonical SHA'
& $PythonExe -X utf8 .\tools\import_filaret_daily_prayer_20261119.py
CheckExit 'Filaret local offline import'

Write-Host '[4/5] Enable Russian search results for the full prayer'
node .\tools\apply_filaret_daily_prayer_search_20261119.js
CheckExit 'Filaret search update'

Write-Host '[5/5] Rebuild packaged offline search and verify the new prayer'
node .\scripts\prepare-search-index.js
CheckExit 'Complete offline search'
& $PythonExe -X utf8 .\tools\verify_filaret_daily_prayer_20261119.py
CheckExit 'Filaret prayer and index audit'

Write-Host 'PASS: St Philaret prayer is in Разные молитвы and indexed for Russian search.'
Write-Host 'The installed APK has NOT been modified. Rebuild the APK when ready.'
