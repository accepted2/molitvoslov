# Diagnose intermittent Molitvoslov crashes on a connected Android device.
# Run AFTER a crash:
#   powershell -ExecutionPolicy Bypass -File .\tools\diagnose_android_crash.ps1
# Or capture a fresh reproduction:
#   powershell -ExecutionPolicy Bypass -File .\tools\diagnose_android_crash.ps1 -Reproduce
param(
    [switch]$Reproduce,
    [string]$Serial = ""
)

$ErrorActionPreference = "Stop"
$packageName = "com.accepted2.molitvoslov"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $adb)) {
    throw "Android ADB not found at $adb. Open Android Studio SDK Manager or set the correct SDK path."
}

$deviceLines = @(& $adb devices)
if ($LASTEXITCODE -ne 0) { throw "adb devices failed" }
$connected = @(
    foreach ($line in $deviceLines) {
        if ($line -match '^(\S+)\s+device(?:\s|$)') { $Matches[1] }
    }
)
if (-not $Serial) {
    if ($connected.Count -eq 0) {
        throw "No connected Android device. Enable USB debugging, connect the phone and approve the prompt."
    }
    if ($connected.Count -gt 1) {
        throw "More than one Android device connected. Pass -Serial DEVICE_ID (see adb devices)."
    }
    $Serial = $connected[0]
}
elseif ($Serial -notin $connected) {
    throw "Device '$Serial' is not connected. Connected: $($connected -join ', ')"
}

$root = Split-Path -Parent $PSScriptRoot
$outRoot = Join-Path (Split-Path -Parent $root) "build-backups\android-crash-diagnostics"
$outDir = Join-Path $outRoot (Get-Date -Format "yyyyMMdd_HHmmss")
New-Item -Path $outDir -ItemType Directory -Force | Out-Null

Write-Host "Device: $Serial"
Write-Host "App:    $packageName"
Write-Host "Output: $outDir"

if ($Reproduce) {
    Write-Host "Clearing old logcat entries. This does not clear app data."
    & $adb -s $Serial logcat -c
    if ($LASTEXITCODE -ne 0) { throw "Cannot clear logcat" }
    Read-Host "Use the application until it closes unexpectedly, THEN press Enter to collect logs"
}

# Exit history survives a restart on supported Android versions.
$exitInfo = @(& $adb -s $Serial shell dumpsys activity exit-info $packageName 2>&1 |
    ForEach-Object { [string]$_ })
$exitInfo | Set-Content -LiteralPath (Join-Path $outDir "exit-info.txt") -Encoding UTF8

# Read main, system, and crash buffers; use targeted excerpts for sharing.
$rawLogs = @(& $adb -s $Serial logcat -d -v threadtime -b main -b system -b crash 2>&1 |
    ForEach-Object { [string]$_ })
if ($LASTEXITCODE -ne 0) { throw "adb logcat failed" }
$rawLogs | Set-Content -LiteralPath (Join-Path $outDir "logcat-full-PRIVATE.txt") -Encoding UTF8

$pattern = 'FATAL EXCEPTION|Fatal signal|SIGSEGV|SIGABRT|OutOfMemoryError|lowmemorykiller|lmkd|ActivityManager: Killing|ReactNativeJS.*(Error|Exception)|ReactNative.*(Exception|Fatal)|AndroidRuntime|am_crash|am_anr|com\.accepted2\.molitvoslov|molitvoslov'
$matches = @($rawLogs | Select-String -Pattern $pattern -Context 8,24)
$report = New-Object System.Collections.Generic.List[string]
$report.Add("Molitvoslov Android crash diagnostic - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$report.Add("Device: $Serial; package: $packageName")
$report.Add("Look for FATAL EXCEPTION, Fatal signal, ReactNativeJS errors, OOM/LMK and process exit reasons.")
$report.Add("Only send crash-report.txt and exit-info.txt after checking for private information.")
$report.Add("")
$report.Add("========== LOGCAT EXCERPTS ==========")
foreach ($m in $matches) {
    $report.Add("----- match at logcat line $($m.LineNumber) -----")
    foreach ($line in $m.Context.PreContext) { $report.Add($line) }
    $report.Add($m.Line)
    foreach ($line in $m.Context.PostContext) { $report.Add($line) }
}
if ($matches.Count -eq 0) {
    $report.Add("No known crash pattern in current logcat buffers. Check exit-info.txt.")
}
$report | Set-Content -LiteralPath (Join-Path $outDir "crash-report.txt") -Encoding UTF8

Write-Host ""
Write-Host "DIAGNOSTICS SAVED:"
Write-Host "  $(Join-Path $outDir 'exit-info.txt')"
Write-Host "  $(Join-Path $outDir 'crash-report.txt')"
Write-Host ""
Write-Host "Log matches: $($matches.Count)"
Write-Host "If these files lack a crash, run the same script with -Reproduce."
Write-Host "The full raw log contains other apps and possible private data; DO NOT upload logcat-full-PRIVATE.txt."
