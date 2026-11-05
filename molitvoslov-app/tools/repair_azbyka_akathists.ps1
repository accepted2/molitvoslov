# Recover previously imported Akathist paragraphs misplaced in the translation.
# Existing manual edits, prayer rules and personal saves are never overwritten.
# No changes unless -Apply is provided. Windows PowerShell 5.1 ASCII-safe.
param(
    [string]$BackendPath = 'C:\m\repo\molitvoslov-backend',
    [int]$Limit = 0,
    [double]$Delay = 2.0,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Limit -lt 0 -or $Delay -lt 1) {
    throw 'Invalid limit or delay.'
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = (Resolve-Path $BackendPath -ErrorAction Stop).Path
$python = Join-Path $backend 'venv\Scripts\python.exe'
$db = Join-Path $backend 'db.sqlite3'
$source = Join-Path $repo 'molitvoslov-backend\api\management\commands'
$target = Join-Path $backend 'api\management\commands'
$testsSrc = Join-Path $repo 'molitvoslov-backend\api\test_azbyka_akathist_pipeline.py'
$testsDst = Join-Path $backend 'api\test_azbyka_akathist_pipeline.py'
$helper = Join-Path $PSScriptRoot 'azbyka_akathist_batch.py'
$helperTests = Join-Path $PSScriptRoot 'test_azbyka_akathist_batch.py'
$offline = Join-Path $PSScriptRoot '..\src\data\offlineContent.json'
$work = Join-Path $backend 'files\akathists'
$report = Join-Path $work 'azbyka_import_report.json'
$patch = Join-Path $work 'azbyka_repair_patch.json'
$backups = Join-Path $work 'backups'
$files = @(
    'import_akathist.py',
    'audit_azbyka_akathist_catalog.py',
    'repair_azbyka_imported_akathists.py'
)
foreach ($file in @($python, $db, $source, $target, $testsSrc, $helper, $helperTests, $offline, $report)) {
    if (-not (Test-Path $file)) {
        throw "Required path missing: $file"
    }
}
$codeBackup = Join-Path $backups ('code-repair-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
foreach ($file in $files) {
    $src = Join-Path $source $file
    $dst = Join-Path $target $file
    if (-not (Test-Path $src)) { throw "Repository is missing $src" }
    $different = -not (Test-Path $dst)
    if (-not $different) {
        $different = ((Get-FileHash $src -Algorithm SHA256).Hash -ne (Get-FileHash $dst -Algorithm SHA256).Hash)
    }
    if ($different) {
        if (Test-Path $dst) {
            New-Item -ItemType Directory -Path $codeBackup -Force | Out-Null
            Copy-Item $dst (Join-Path $codeBackup $file)
        }
        Copy-Item $src $dst -Force
        Write-Host "Synced: $file"
    }
}
$testsDifferent = -not (Test-Path $testsDst)
if (-not $testsDifferent) {
    $testsDifferent = ((Get-FileHash $testsSrc -Algorithm SHA256).Hash -ne (Get-FileHash $testsDst -Algorithm SHA256).Hash)
}
if ($testsDifferent) {
    if (Test-Path $testsDst) {
        New-Item -ItemType Directory -Path $codeBackup -Force | Out-Null
        Copy-Item $testsDst (Join-Path $codeBackup 'test_azbyka_akathist_pipeline.py')
    }
    Copy-Item $testsSrc $testsDst -Force
}

Push-Location $backend
try {
    Write-Host '[1/4] Verify parser and Django'
    & $python -X utf8 -m py_compile (Join-Path $target $files[0]) (Join-Path $target $files[1]) (Join-Path $target $files[2]) $helper $testsDst
    if ($LASTEXITCODE -ne 0) { throw 'Python syntax check failed.' }
    & $python -X utf8 $helperTests
    if ($LASTEXITCODE -ne 0) { throw 'Offline repair regression tests failed.' }
    & $python -X utf8 manage.py check
    if ($LASTEXITCODE -ne 0) { throw 'Django system check failed.' }
    & $python -X utf8 manage.py test api.test_azbyka_akathist_pipeline -v 1
    if ($LASTEXITCODE -ne 0) { throw 'Parser regression tests failed.' }

    Write-Host '[2/4] Inspect previously imported Akathists'
    if (-not $Apply) {
        & $python -X utf8 manage.py repair_azbyka_imported_akathists --report $report --limit $Limit --delay $Delay
        if ($LASTEXITCODE -ne 0) { throw 'Repair preview failed.' }
        Write-Host 'PLAN ONLY. No Django or offline JSON data changed.'
        return
    }

    Write-Host '[3/4] Back up Django SQLite before changing imported text'
    New-Item -ItemType Directory -Path $backups -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-ffff'
    $backupDb = Join-Path $backups ("db-before-akathist-repair-$stamp.sqlite3")
    $backupCode = 'import sqlite3,sys; src=sqlite3.connect(sys.argv[1]); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()'
    & $python -X utf8 -c $backupCode $db $backupDb
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $backupDb)) {
        throw 'SQLite backup failed; no repair performed.'
    }
    Write-Host "Database backup: $backupDb"
    & $python -X utf8 manage.py repair_azbyka_imported_akathists --report $report --output $patch --limit $Limit --delay $Delay --apply
    if ($LASTEXITCODE -ne 0) {
        throw 'Repair command failed. Offline JSON is unchanged.'
    }

    Write-Host '[4/4] Apply only matching old text values to offline JSON'
    & $python -X utf8 $helper repair --existing $offline --patch $patch --backup-dir $backups
    if ($LASTEXITCODE -ne 0) { throw 'Offline repair validation failed; JSON not changed.' }
    & $python -X utf8 $helper repair --existing $offline --patch $patch --backup-dir $backups --apply
    if ($LASTEXITCODE -ne 0) { throw 'Offline repair failed; examine the saved backup.' }
    Write-Host 'Repair complete. Restart Expo with --dev-client --clear.'
    Write-Host 'Do NOT run a full export_mobile_content over the existing offline JSON.'
}
finally {
    Pop-Location
}
