# Read-only: compares the new release APK against the APK actually installed
# on the connected Android phone. Does not install/uninstall anything.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$python = "C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  throw "Python not found: $python"
}
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
$installedApk = $null

if (Test-Path -LiteralPath $adb) {
  $lines = @(& $adb devices)
  $serials = @(
    $lines | Where-Object { $_ -match '^([^\s]+)\s+device\s*$' } |
      ForEach-Object { ([regex]::Match($_, '^([^\s]+)\s+device\s*$')).Groups[1].Value }
  )
  if ($serials.Count -eq 1) {
    $serial = $serials[0]
    Write-Host "CONNECTED DEVICE: $serial"
    $package = "com.accepted2.molitvoslov"
    $packageLines = @(& $adb -s $serial shell pm path $package)
    $base = $packageLines | Where-Object {
      $_.Trim() -match '^package:(.*?/base\.apk)\s*$'
    } | Select-Object -First 1
    if ($base) {
      $remote = ([regex]::Match($base.Trim(), '^package:(.*?)\s*$')).Groups[1].Value
      $targetFolder = Join-Path (Split-Path -Parent $root) (
        "build-backups\release-phone-inspection-" + (Get-Date -Format "yyyyMMdd_HHmmss")
      )
      New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null
      $installedApk = Join-Path $targetFolder "installed-base.apk"
      Write-Host "INSTALLED PACKAGE VERSION:"
      & $adb -s $serial shell dumpsys package $package |
        Select-String -Pattern "versionCode=", "versionName=", "lastUpdateTime=" |
        Select-Object -First 7
      Write-Host "Copying installed APK for comparison (no app data is accessed)..."
      & $adb -s $serial pull $remote $installedApk
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $installedApk)) {
        Write-Warning "ADB could not copy installed APK. Running local APK checks only."
        $installedApk = $null
      }
    } else {
      Write-Warning "Package $package is not installed under the expected package ID."
    }
  } elseif ($serials.Count -eq 0) {
    Write-Host "No ADB phone connected. Will inspect locally built APK only."
  } else {
    Write-Warning "Multiple Android devices connected: $($serials -join ', ')"
    Write-Warning "Disconnect emulator/other device to inspect the intended phone."
  }
} else {
  Write-Warning "ADB not found: $adb. Will inspect local APK only."
}

if ($installedApk) {
  & $python -X utf8 ".\tools\diagnose_release_apk.py" --installed-apk $installedApk
} else {
  & $python -X utf8 ".\tools\diagnose_release_apk.py"
}
if ($LASTEXITCODE -ne 0) { throw "APK inspection failed (exit code $LASTEXITCODE)" }
Write-Host "APK INSPECTION COMPLETE - NOTHING MODIFIED ON PHONE"
