# Apply Akathist reader formatting without rebuilding APK or modifying user data.
# Keep Metro running; return to Akathist or press "r" in Metro after the update.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$files = @(
  "src/services/akathistPresentation.js",
  "src/screens/AkathistScreen.js",
  "src/components/reader/selectableDocumentReader/runtime.js",
  "src/components/reader/selectableDocumentReader/styles.js",
  "tools/verify_akathist_presentation_20261104.js"
)

$backup = Join-Path (Split-Path -Parent $root) (
  "build-backups\akathist-presentation-source-" + (Get-Date -Format "yyyyMMdd_HHmmss")
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

Write-Host "[1/3] Fetch Akathist formatting changes from GitHub"
& git fetch origin backup/local-changes-20261028
if ($LASTEXITCODE -ne 0) { throw "Git fetch failed. Source backup preserved." }

& git restore --source=FETCH_HEAD -- @files
if ($LASTEXITCODE -ne 0) { throw "Git restore failed. Source backup preserved." }

Write-Host "[2/3] Verify Akathist word styling and last-kontakion order"
& node ".\tools\verify_akathist_presentation_20261104.js"
if ($LASTEXITCODE -ne 0) { throw "Akathist regression tests failed. See output above." }

Write-Host "[3/3] Verify React hooks remain imported"
if (Test-Path ".\tools\verify_react_hook_imports.js") {
  & node ".\tools\verify_react_hook_imports.js"
  if ($LASTEXITCODE -ne 0) { throw "React hook import check failed." }
}

Write-Host "AKATHIST READER READY FOR METRO FAST REFRESH" -ForegroundColor Green
Write-Host "Return to the Akathist screen or press 'r' in Metro to refresh."
Write-Host "No APK built and no phone/emulator data changed."
