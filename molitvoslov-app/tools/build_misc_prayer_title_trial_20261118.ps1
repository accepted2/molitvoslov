<#
Build release APK for the limited Misc Prayers reader-title trial.
Runs native Windows/Android toolchain; no ability to run on GitHub alone.
All existing local edits are preserved. No git reset/clean, app uninstall,
or changes to local/private user data.
Example from application root:
  & .\tools\build_misc_prayer_title_trial_20261118.ps1 -PythonExe $pythonExe
#>
param(
  [string]$PythonExe = '',
  [string]$OldSearchSeed = ''
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Assert-LastExit([string]$label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label FAILED (exit code $LASTEXITCODE). Build stopped; existing APK preserved."
  }
}

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  $PythonExe = $env:MOLITVOSLOV_PYTHON
}
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  try {
    $detected = & py -3 -c 'import sys; print(sys.executable)' 2>$null
    if ($LASTEXITCODE -eq 0) { $PythonExe = [string]$detected }
  } catch {}
}
if ([string]::IsNullOrWhiteSpace($PythonExe) -or -not (Test-Path -LiteralPath $PythonExe)) {
  throw 'Pass -PythonExe <working python.exe path> or set MOLITVOSLOV_PYTHON.'
}
$PythonExe = (Resolve-Path -LiteralPath $PythonExe).Path
& $PythonExe --version
Assert-LastExit 'Python'
$env:MOLITVOSLOV_PYTHON = $PythonExe

# A lower versionCode cannot upgrade an installed APK.
$package = 'com.accepted2.molitvoslov'
$appConfig = Get-Content .\app.json -Raw -Encoding UTF8 | ConvertFrom-Json
$code = [int]$appConfig.expo.android.versionCode
$version = [string]$appConfig.expo.version
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (Test-Path -LiteralPath $adb) {
  try {
    $deviceRows = & $adb devices
    if ($deviceRows -match '\sdevice\s*$') {
      $installed = (& $adb shell dumpsys package $package 2>$null) -join [Environment]::NewLine
      $found = [regex]::Match($installed,'versionCode=(\d+)')
      if ($found.Success -and $code -lt [int]$found.Groups[1].Value) {
        throw "APK versionCode $code is lower than installed $($found.Groups[1].Value). Update both app.json and Android Gradle before building."
      }
    }
  } catch {
    if ($_.Exception.Message -match 'versionCode') { throw }
    Write-Host 'ADB package check unavailable; version will still be checked against Gradle.'
  }
}
Write-Host "CURRENT APP VERSION: $version ($code)"

Write-Host '[1/4] Apply the scoped UI trial and test it'
node .\tools\apply_misc_prayer_compact_reader_title_20261118.js --dry-run
Assert-LastExit 'Misc Prayers title dry run'
node .\tools\apply_misc_prayer_compact_reader_title_20261118.js
Assert-LastExit 'Misc Prayers title patch'
node .\tools\test_misc_prayer_compact_reader_title_20261118.js
Assert-LastExit 'Misc Prayers title tests'

Write-Host '[2/4] Check the latest prayer catalog organization (no automatic destructive migration)'
if (Test-Path .\tools\move_ioann_blagodarstvennaya_into_gratitude_20261118.js) {
  node .\tools\move_ioann_blagodarstvennaya_into_gratitude_20261118.js --dry-run
  Assert-LastExit 'Gratitude category audit'
}

Write-Host '[3/4] Prepare the full bundled public search index'
node .\scripts\prepare-search-index.js
Assert-LastExit 'Offline public content and search seed'

if ([string]::IsNullOrWhiteSpace($OldSearchSeed)) {
  $candidate = Get-ChildItem (Join-Path $root '..\build-backups') -Filter 'search-seed-before-apk-*.db' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -ne $candidate) { $OldSearchSeed = $candidate.FullName }
}
if ([string]::IsNullOrWhiteSpace($OldSearchSeed) -or -not (Test-Path -LiteralPath $OldSearchSeed)) {
  throw 'Previous search DB not found. Supply -OldSearchSeed <valid previous search-seed.db>. No APK has been built.'
}
$OldSearchSeed = (Resolve-Path -LiteralPath $OldSearchSeed).Path

Write-Host '[4/4] Clean ARM64 release APK with embedded search verification'
& .\tools\build_phone_test_apk_20261117.ps1 -PythonExe $PythonExe -OldSearchSeed $OldSearchSeed
Assert-LastExit 'Release APK build'
Write-Host 'FINISHED. Install the newly timestamped APK shown above over the existing app.'
