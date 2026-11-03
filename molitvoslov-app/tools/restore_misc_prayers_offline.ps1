# Restore the five published misc prayers from the verified, bundled Supabase
# snapshot. The Django SQLite is backed up before modification. No user-owned
# app databases or production Supabase records are changed.
$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $PSScriptRoot
Set-Location $appRoot
$python = "C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Local Django venv Python not found: $python"
}

function Invoke-PythonStep($name, [string[]] $arguments) {
    Write-Host ""
    Write-Host "=== $name ==="
    & $python -X utf8 @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$name failed (exit code $LASTEXITCODE)"
    }
}

Invoke-PythonStep "1/6 Dry-run: check missing prayers" @("tools/restore_misc_prayers.py")
Invoke-PythonStep "2/6 Restore only missing Django public prayers after SQLite backup" @("tools/restore_misc_prayers.py", "--apply")
Invoke-PythonStep "3/6 Promote complete Django public snapshot into offlineContent.json" @("tools/promote_local_django_offline.py")
Invoke-PythonStep "4/6 Rebuild full offline search with guarded Windows replacement" @("tools/prepare_offline_apk.py")
Invoke-PythonStep "5/6 Verify packaged content and search" @("tools/prepare_offline_apk.py", "--verify-only")
Invoke-PythonStep "6/6 Final read-only category audit" @("tools/audit_misc_prayers.py")

Write-Host ""
Write-Host "MISC PRAYERS RESTORED AND OFFLINE CONTENT READY - 5 REAL PRAYERS VERIFIED"
Write-Host "The release APK itself has not been built or installed."
