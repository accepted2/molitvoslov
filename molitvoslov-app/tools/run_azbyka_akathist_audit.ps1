# Audit the full Azbyka Akathist catalogue against the EXISTING local Django DB.
# No prayer content, APK files or SQLite data are overwritten.
param(
    [string]$BackendPath = 'C:\m\repo\molitvoslov-backend',
    [int]$Limit = 0,
    [double]$Delay = 2.0,
    [switch]$CatalogOnly,
    [switch]$RetryFailed,
    [switch]$RefreshChecked
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Limit -lt 0 -or $Delay -lt 1) {
    throw 'Limit must be >= 0 and Delay >= 1.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = (Resolve-Path $BackendPath -ErrorAction Stop).Path
$python = Join-Path $backendRoot 'venv\Scripts\python.exe'
$db = Join-Path $backendRoot 'db.sqlite3'
if (-not (Test-Path $python)) { throw "Missing Django Python: $python" }
if (-not (Test-Path $db)) { throw "Missing EXISTING Django db.sqlite3: $db. Refusing to audit a different database." }

$source = Join-Path $repoRoot 'molitvoslov-backend\api\management\commands'
$target = Join-Path $backendRoot 'api\management\commands'
if (-not (Test-Path $source)) { throw "Missing GitHub backend command directory: $source" }
if (-not (Test-Path $target)) { throw "Missing local Django command directory: $target" }

$files = @('audit_azbyka_akathist_catalog.py', 'import_azbyka_akathists_safe.py')
$backup = Join-Path $backendRoot ('build-backups\azbyka-audit-code-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach ($file in $files) {
    $src = Join-Path $source $file
    $dst = Join-Path $target $file
    if (-not (Test-Path $src)) { throw "Missing source script: $src" }
    $replace = -not (Test-Path $dst)
    if (-not $replace) {
        $replace = (Get-FileHash $src -Algorithm SHA256).Hash -ne (Get-FileHash $dst -Algorithm SHA256).Hash
    }
    if ($replace) {
        if (Test-Path $dst) {
            New-Item -ItemType Directory -Path $backup -Force | Out-Null
            Copy-Item $dst (Join-Path $backup $file)
        }
        Copy-Item $src $dst -Force
        Write-Host "Synced parser command: $file"
    }
}

Push-Location $backendRoot
try {
    & $python -X utf8 -m py_compile (Join-Path $target $files[0]) (Join-Path $target $files[1])
    if ($LASTEXITCODE -ne 0) { throw 'Python syntax check failed.' }

    & $python -X utf8 manage.py check
    if ($LASTEXITCODE -ne 0) { throw 'Django system check failed.' }

    $argsForAudit = @(
        '-X', 'utf8', 'manage.py', 'audit_azbyka_akathist_catalog',
        '--limit', [string]$Limit, '--delay', [string]$Delay
    )
    if ($CatalogOnly) { $argsForAudit += '--catalog-only' }
    if ($RetryFailed) { $argsForAudit += '--retry-failed' }
    if ($RefreshChecked) { $argsForAudit += '--refresh-checked' }

    Write-Host 'Auditing Azbyka; no database writes will occur.'
    & $python @argsForAudit
    if ($LASTEXITCODE -ne 0) { throw 'Azbyka audit stopped with an error. Existing JSON/Django data unchanged.' }

    Write-Host "Audit report: $(Join-Path $backendRoot 'files\akathists\azbyka_audit.json')"
    Write-Host 'The next step is reviewing the report, NOT a bulk overwrite.'
}
finally {
    Pop-Location
}
