# Retrieve the reviewed reader/search fixes without touching SQLite, personal
# data, or the existing installed APK. Original local files are backed up.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\apply_reader_fixes_20261104.ps1 -Build
param([switch]$Build)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$files = @(
  "src/hooks/useReadingChrome.js",
  "src/components/navigation/FixedSectionHeader.js",
  "src/components/reader/SelectableDocumentReader.js",
  "src/components/reader/PrayerRuleReader.js",
  "src/components/reader/ReaderAppearanceSheet.js",
  "src/components/settings/ColorPalettePicker.js",
  "src/services/search/openRoute.js",
  "src/screens/SearchScreen.js",
  "src/screens/ReaderScreen.js",
  "src/screens/BookScreen.js",
  "src/screens/PrayerRuleScreen.js",
  "src/screens/AkathistScreen.js",
  "src/screens/CanonScreen.js",
  "src/screens/KathismaScreen.js",
  "tools/verify_reader_customization_20261104.js",
  "tools/build_release_1_0_21.ps1",
  "tools/repair_release_version_1_0_21.py"
)

$backupDir = Join-Path (Split-Path -Parent $root) (
  "build-backups\source-before-reader-fixes-20261104-" +
  (Get-Date -Format "yyyyMMdd_HHmmss")
)
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
foreach ($file in $files) {
  if (Test-Path -LiteralPath $file) {
    $destination = Join-Path $backupDir $file
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $file -Destination $destination -Force
  }
}
Write-Host "SOURCE BACKUP: $backupDir"

Write-Host "Fetching 2026-11-04 reader/search updates..."
& git fetch origin backup/local-changes-20261028
if ($LASTEXITCODE -ne 0) { throw "GitHub fetch failed - source backup preserved" }
& git restore --source=FETCH_HEAD -- @files
if ($LASTEXITCODE -ne 0) { throw "Git restore failed - source backup preserved" }

node .\tools\verify_reader_customization_20261104.js
if ($LASTEXITCODE -ne 0) { throw "Regression checks failed - do not build APK" }
Write-Host "READER FIXES INSTALLED AND REGRESSION CHECKED"

if ($Build) {
  Write-Host "Building version 1.0.21 (22) with unique release filename..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build_release_1_0_21.ps1
  if ($LASTEXITCODE -ne 0) { throw "Release build failed. Check the log above." }
} else {
  Write-Host "No APK built. Re-run this script with -Build to create version 1.0.21."
}
