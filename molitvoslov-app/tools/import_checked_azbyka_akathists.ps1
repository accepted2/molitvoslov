# Import audited NEW Akathists into the existing local Django DB and merge only
# the newly imported Akathists into the current app offlineContent.json.
# Defaults to a read-only plan; -Apply requires explicit -RightsConfirmed.
param(
    [string]$BackendPath = 'C:\m\repo\molitvoslov-backend',
    [int]$Limit = 5,
    [double]$Delay = 2.0,
    [switch]$Apply,
    [switch]$RightsConfirmed
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Limit -lt 0 -or $Delay -lt 1) {
    throw 'Limit must be >= 0 and Delay >= 1.'
}
if ($Apply -and -not $RightsConfirmed) {
    throw 'Для импорта нужно подтвердить права на использование выбранных текстов: -RightsConfirmed.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = (Resolve-Path $BackendPath -ErrorAction Stop).Path
$python = Join-Path $backend 'venv\Scripts\python.exe'
$dbPath = Join-Path $backend 'db.sqlite3'
$commandsFromRepo = Join-Path $repoRoot 'molitvoslov-backend\api\management\commands'
$commandsInBackend = Join-Path $backend 'api\management\commands'
$sourceTests = Join-Path $repoRoot 'molitvoslov-backend\api\test_azbyka_akathist_pipeline.py'
$targetTests = Join-Path $backend 'api\test_azbyka_akathist_pipeline.py'
$helper = Join-Path $PSScriptRoot 'azbyka_akathist_batch.py'
$helperTests = Join-Path $PSScriptRoot 'test_azbyka_akathist_batch.py'
$qaHelper = Join-Path $PSScriptRoot 'qa_azbyka_akathists.py'
$offline = (Resolve-Path (Join-Path $PSScriptRoot '..\src\data\offlineContent.json') -ErrorAction Stop).Path

foreach ($file in @($python, $dbPath, $commandsFromRepo, $commandsInBackend, $sourceTests, $helper, $helperTests, $qaHelper)) {
    if (-not (Test-Path $file)) { throw "Required file or folder missing: $file" }
}
$workDir = Join-Path $backend 'files\akathists'
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
$auditPath = Join-Path $workDir 'azbyka_audit.json'
$approved = Join-Path $workDir 'azbyka_checked_approved.json'
$importReport = Join-Path $workDir 'azbyka_import_report.json'
$staged = Join-Path $workDir 'azbyka_export_staged.json'
$qaReport = Join-Path $workDir 'azbyka_batch_qa.json'
$backups = Join-Path $workDir 'backups'
$files = @(
    'import_akathist.py',
    'audit_azbyka_akathist_catalog.py',
    'import_azbyka_akathists_safe.py'
)

if (-not (Test-Path $auditPath)) {
    throw "Audit is missing: $auditPath. Run run_azbyka_akathist_audit.ps1 first."
}
# Synchronize the reviewed Django command implementation to the local working
# backend, keeping a backup of every pre-existing different script.
$codeBackupDir = Join-Path $backups ('code-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
foreach ($filename in $files) {
    $src = Join-Path $commandsFromRepo $filename
    $dst = Join-Path $commandsInBackend $filename
    if (-not (Test-Path $src)) { throw "Missing source file: $src" }
    $changed = -not (Test-Path $dst)
    if (-not $changed) {
        $changed = ((Get-FileHash $src -Algorithm SHA256).Hash -ne (Get-FileHash $dst -Algorithm SHA256).Hash)
    }
    if ($changed) {
        if (Test-Path $dst) {
            New-Item -ItemType Directory -Path $codeBackupDir -Force | Out-Null
            Copy-Item $dst (Join-Path $codeBackupDir $filename)
        }
        Copy-Item $src $dst -Force
        Write-Host "Synced: $filename"
    }
}
$testsDifferent = -not (Test-Path $targetTests)
if (-not $testsDifferent) {
    $testsDifferent = ((Get-FileHash $sourceTests -Algorithm SHA256).Hash -ne (Get-FileHash $targetTests -Algorithm SHA256).Hash)
}
if ($testsDifferent) {
    if (Test-Path $targetTests) {
        New-Item -ItemType Directory -Path $codeBackupDir -Force | Out-Null
        Copy-Item $targetTests (Join-Path $codeBackupDir 'test_azbyka_akathist_pipeline.py')
    }
    Copy-Item $sourceTests $targetTests -Force
}

Write-Host '[1/5] Prepare the verified-only import manifest'
& $python -X utf8 $helper prepare --audit $auditPath --output $approved
if ($LASTEXITCODE -ne 0) { throw 'Cannot build a verified-only manifest.' }

Push-Location $backend
try {
    Write-Host '[2/5] Check Django and parser tests'
    & $python -X utf8 -m py_compile (Join-Path $commandsInBackend $files[0]) (Join-Path $commandsInBackend $files[1]) (Join-Path $commandsInBackend $files[2]) $targetTests $helper $helperTests $qaHelper
    if ($LASTEXITCODE -ne 0) { throw 'Python compilation failed.' }
    & $python -X utf8 $helperTests
    if ($LASTEXITCODE -ne 0) { throw 'Offline merge regression tests failed.' }
    & $python -X utf8 manage.py check
    if ($LASTEXITCODE -ne 0) { throw 'Django system check failed.' }
    & $python -X utf8 manage.py test api.test_azbyka_akathist_pipeline -v 1
    if ($LASTEXITCODE -ne 0) { throw 'Parser regression tests failed.' }

    Write-Host '[3/5] Create-only import plan'
    & $python -X utf8 manage.py import_azbyka_akathists_safe --audit $auditPath --approved-file $approved --limit $Limit --delay $Delay
    if ($LASTEXITCODE -ne 0) { throw 'Import plan failed.' }
    if (-not $Apply) {
        Write-Host 'PLAN ONLY: Django, offline JSON and search DB have not changed.'
        Write-Host 'For a local QA batch, pass -Apply -RightsConfirmed after confirming reuse rights.'
        return
    }

    New-Item -ItemType Directory -Path $backups -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-ffff'
    $dbBackup = Join-Path $backups ("db-before-akathists-$stamp.sqlite3")
    $backupCode = 'import sqlite3,sys; src=sqlite3.connect(sys.argv[1]); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()'
    & $python -X utf8 -c $backupCode $dbPath $dbBackup
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dbBackup)) {
        throw 'SQLite backup failed; import refused.'
    }
    Write-Host "Database backup: $dbBackup"

    Write-Host '[4/5] Import only checked and missing Akathists into Django'
    & $python -X utf8 manage.py import_azbyka_akathists_safe --audit $auditPath --approved-file $approved --limit $Limit --delay $Delay --report $importReport --apply --rights-confirmed
    if ($LASTEXITCODE -ne 0) { throw 'Django import failed. The existing offline JSON has not been touched.' }

    Write-Host '[5/5] Export to a staging file; then merge ONLY new Akathists'
    & $python -X utf8 manage.py export_mobile_content --output $staged
    if ($LASTEXITCODE -ne 0) {
        throw 'Export to staging failed. The existing offline JSON has not been touched.'
    }
    & $python -X utf8 $qaHelper --staged $staged --report $importReport --output $qaReport
    if ($LASTEXITCODE -ne 0) { throw 'QA found critical problems. The existing offline JSON has not been touched.' }
    & $python -X utf8 $helper merge --existing $offline --staged $staged --report $importReport --backup-dir $backups
    if ($LASTEXITCODE -ne 0) { throw 'Offline merge preview failed: JSON has not been touched.' }
    & $python -X utf8 $helper merge --existing $offline --staged $staged --report $importReport --backup-dir $backups --apply
    if ($LASTEXITCODE -ne 0) { throw 'Offline merge failed. Check the saved backup.' }

    Write-Host 'Import and additive offline merge completed. Restart Expo with --dev-client --clear.'
    Write-Host "QA report: $qaReport"
    Write-Host 'This does NOT automatically update global full-text search or release an APK.'
}
finally {
    Pop-Location
}
