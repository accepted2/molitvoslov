# Safely apply the React useEffect crash fix and build APK 1.0.22 (23).
# Keeps installed phone data and backup of modified source files.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$files = @(
  "src/screens/PrayerBookReaderScreen.js",
  "tools/verify_react_hook_imports.js",
  "tools/build_release_1_0_22.ps1",
  "tools/repair_release_version_1_0_22.py"
)

$backup = Join-Path (Split-Path -Parent $root) (
  "build-backups\prayer-reader-crashfix-source-" + (Get-Date -Format "yyyyMMdd_HHmmss")
)
New-Item -Path $backup -ItemType Directory -Force | Out-Null
foreach ($file in $files) {
  if (Test-Path -LiteralPath $file) {
    $copy = Join-Path $backup $file
    New-Item -Path (Split-Path -Parent $copy) -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath $file -Destination $copy -Force
  }
}
Write-Host "SOURCE BACKUP: $backup"

Write-Host "[1/4] Fetch verified crash fix"
& git fetch origin backup/local-changes-20261028
if ($LASTEXITCODE -ne 0) { throw "Git fetch failed" }

& git restore --source=FETCH_HEAD -- @files
if ($LASTEXITCODE -ne 0) { throw "Git restore failed" }

Write-Host "[2/4] Check React hooks across screens and components"
& node ".\tools\verify_react_hook_imports.js"
if ($LASTEXITCODE -ne 0) { throw "React hook validation failed: no APK built" }

Write-Host "[3/4] Verify existing reader, theme, scroll and search fixes"
& node ".\tools\verify_reader_customization_20261104.js"
if ($LASTEXITCODE -ne 0) { throw "Reader regressions failed: no APK built" }

Write-Host "[4/4] Build hotfix APK 1.0.22 (23)"
& powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\build_release_1_0_22.ps1"
if ($LASTEXITCODE -ne 0) { throw "Hotfix APK build failed: see error above" }
Write-Host "HOTFIX COMPLETE. Send only the uniquely named 1.0.22 APK printed as DISTRIBUTE THIS APK."
Write-Host "Install over 1.0.21 without uninstalling or clearing phone data."
