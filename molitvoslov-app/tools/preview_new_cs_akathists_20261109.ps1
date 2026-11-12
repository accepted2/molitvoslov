# Stage and optionally insert NEW CS-only Akathists into this app's offline JSON.
# NEVER changes Django, Supabase, the existing Akathist texts, or personal data.
# Run with -Apply to enable a local app preview. Backup is created first.
param(
    [string]$BackendPath = "C:\m\repo\molitvoslov-backend",
    [int]$Limit = 0,
    [double]$Delay = 1.5,
    [switch]$Apply
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$app = Join-Path $repo "molitvoslov-app"
$offline = Join-Path $app "src\data\offlineContent.json"
$helper = Join-Path $PSScriptRoot "azbyka_akathist_batch.py"
$qa = Join-Path $PSScriptRoot "qa_azbyka_akathists.py"
$source = Join-Path $repo "molitvoslov-backend\api\management\commands\stage_azbyka_cs_preview.py"
$backend = (Resolve-Path -LiteralPath $BackendPath -ErrorAction Stop).Path
$python = Join-Path $backend "venv\Scripts\python.exe"
$target = Join-Path $backend "api\management\commands\stage_azbyka_cs_preview.py"
$csv = Join-Path $backend "files\akathists\catalog_cs_report.csv"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss-ffff"
$work = Join-Path $backend "files\akathists"
$staged = Join-Path $work "preview_cs_stage-$stamp.json"
$report = Join-Path $work "preview_cs_merge_report-$stamp.json"
$qaResult = Join-Path $work "preview_cs_qa-$stamp.json"
$backup = Join-Path "C:\m\build-backups" "akathists-preview-$stamp"

if ($Limit -lt 0 -or $Delay -lt 1) {
    throw "Limit must be >= 0 and Delay >= 1."
}
foreach ($file in @($offline, $helper, $qa, $python, $source, $csv)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required file missing: $file"
    }
}
New-Item -ItemType Directory -Force -Path $backup | Out-Null

# Only a NEW single Django command is installed. Existing importers are untouched.
if (Test-Path -LiteralPath $target) {
    Copy-Item -LiteralPath $target (Join-Path $backup "stage_azbyka_cs_preview.py")
}
Copy-Item -LiteralPath $source -Destination $target -Force
Write-Host "Installing preview-only Django command (database unchanged)"

Push-Location $backend
try {
    & $python -X utf8 manage.py check
    if ($LASTEXITCODE -ne 0) { throw "Django system check failed" }

    Write-Host "[1/4] Stage only missing READY_CS entries (network fetch, no database writes)"
    & $python -X utf8 manage.py stage_azbyka_cs_preview --offline-file $offline --catalog-report $csv --staged-output $staged --merge-report $report --limit $Limit --delay $Delay
    if ($LASTEXITCODE -ne 0) { throw "Cannot stage the CS preview" }

    Write-Host "[2/4] Verify content integrity / footer leakage"
    & $python -X utf8 $qa --staged $staged --report $report --output $qaResult
    if ($LASTEXITCODE -ne 0) { throw "QA reported critical problems. Offline JSON unchanged." }

    Write-Host "[3/4] Dry-run additive merge"
    & $python -X utf8 $helper merge --existing $offline --staged $staged --report $report --backup-dir $backup
    if ($LASTEXITCODE -ne 0) { throw "Additive dry run failed. Offline JSON unchanged." }

    if (-not $Apply) {
        Write-Host "PLAN ONLY: no offline JSON write. Run this script with -Apply for local preview."
        Write-Host "Staged: $staged"
        Write-Host "QA: $qaResult"
        return
    }

    Write-Host "[4/4] Apply with automatic app offline JSON backup"
    & $python -X utf8 $helper merge --existing $offline --staged $staged --report $report --backup-dir $backup --apply
    if ($LASTEXITCODE -ne 0) {
        throw "Merge failed. Check saved backup at: $backup"
    }

    & $python -X utf8 -c 'import json,sys; p=json.load(open(sys.argv[1],encoding="utf-8-sig")); print("Published Akathists:",sum(x.get("is_visible") is True for x in p["akathists"]["list"]))' $offline
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect resulting JSON" }

    Write-Host "LOCAL PREVIEW INSTALLED. Existing Akathists retained." -ForegroundColor Green
    Write-Host "Backup folder: $backup"
    Write-Host "QA report: $qaResult"
    Write-Host "Restart Expo: npx expo start --dev-client --clear"
    Write-Host "This is a local UNREVIEWED preview. Do not publish an APK from this batch yet."
    Write-Host "Full-text search has NOT been rebuilt."
}
finally {
    Pop-Location
}
