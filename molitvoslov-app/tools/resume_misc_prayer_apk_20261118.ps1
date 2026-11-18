<#
Resume the previous ARM64 release APK build after a canonical content-version
mismatch, preserving ALL imported prayer data and local source edits.

Works with the existing 1.0.32 (33) build script and the working PythonExe.
Usage:
  & .\tools\resume_misc_prayer_apk_20261118.ps1 -PythonExe $pythonExe
#>
param(
    [Parameter(Mandatory=$true)][string]$PythonExe,
    [string]$OldSearchSeed = ''
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Assert-Exit([string]$label) {
    if ($LASTEXITCODE -ne 0) {
        throw "$label FAILED (exit code $LASTEXITCODE). Existing APK preserved."
    }
}

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Invalid Python path: $PythonExe"
}

Write-Host '[1/5] Test public-content SHA and the five recovered-prayer migration guard'
& $PythonExe -X utf8 .\tools\test_offline_content_version_release_20261118.py
Assert-Exit 'Content version and category tests'

Write-Host '[2/5] Update only the legacy root-only validator, preserving local work'
node .\tools\apply_relocated_misc_prayers_guard_20261118.js --dry-run
Assert-Exit 'Relocated-prayer validator dry run'
node .\tools\apply_relocated_misc_prayers_guard_20261118.js
Assert-Exit 'Relocated-prayer validator'

Write-Host '[3/5] Repair only the outdated content_version metadata, with a backup'
& $PythonExe -X utf8 .\tools\refresh_offline_content_version_20261118.py --dry-run
Assert-Exit 'Offline-content version dry run'
& $PythonExe -X utf8 .\tools\refresh_offline_content_version_20261118.py
Assert-Exit 'Offline-content version fix'

Write-Host '[4/5] Verify prayer catalog changes remain present'
node .\tools\move_ioann_blagodarstvennaya_into_gratitude_20261118.js --dry-run
Assert-Exit 'Gratitude prayer location check'
node .\tools\test_misc_prayer_compact_reader_title_20261118.js
Assert-Exit 'Reader title test'

Write-Host '[5/5] Continue the original APK build and embedded search checks'
if ([string]::IsNullOrWhiteSpace($OldSearchSeed)) {
    & .\tools\build_misc_prayer_title_trial_20261118.ps1 -PythonExe $PythonExe
} else {
    & .\tools\build_misc_prayer_title_trial_20261118.ps1 -PythonExe $PythonExe -OldSearchSeed $OldSearchSeed
}
if (-not $?) {
    throw 'APK build failed. Existing APK preserved.'
}
Write-Host 'DONE: see BUILD VERIFIED and APK path from the underlying build script.'
