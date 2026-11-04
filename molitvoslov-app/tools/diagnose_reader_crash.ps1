# Read-only Android crash diagnostics for Molitvoslov.
# Run immediately AFTER reproducing the prayer reader crash.
# No installation, user-data cleanup, app restart, or ADB log clearing.
param([string]$Serial = "71cdd00aff42")
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $adb)) { throw "ADB not found: $adb" }
$devices = @(& $adb devices)
if (-not ($devices | Where-Object { $_ -match "^$([regex]::Escape($Serial))\s+device\s*$" })) {
  throw "Android phone $Serial is not connected (or not authorized). Check adb devices."
}
$package = "com.accepted2.molitvoslov"
$folder = Join-Path (Split-Path -Parent $root) (
  "build-backups\reader-crash-" + (Get-Date -Format "yyyyMMdd_HHmmss")
)
New-Item -ItemType Directory -Path $folder -Force | Out-Null

Write-Host "=== DEVICE & INSTALLED APP ==="
& $adb -s $Serial shell getprop ro.build.version.release |
  Tee-Object -FilePath (Join-Path $folder "android_version.txt")
& $adb -s $Serial shell dumpsys package $package |
  Select-String -Pattern "versionCode=", "versionName=", "lastUpdateTime=" |
  Select-Object -First 8 |
  Tee-Object -FilePath (Join-Path $folder "installed_version.txt")

Write-Host "=== READING ANDROID CRASH BUFFER ==="
$crashPath = Join-Path $folder "crash-buffer.txt"
& $adb -s $Serial logcat -d -b crash -v threadtime 2>&1 |
  Out-File -LiteralPath $crashPath -Encoding utf8

Write-Host "=== READING RECENT ANDROID MAIN LOG ==="
$mainPath = Join-Path $folder "main-log-last-9000.txt"
& $adb -s $Serial logcat -d -b main -t 9000 -v threadtime 2>&1 |
  Out-File -LiteralPath $mainPath -Encoding utf8

$exitPath = Join-Path $folder "process-exits.txt"
& $adb -s $Serial shell dumpsys activity exit-info $package 2>&1 |
  Out-File -LiteralPath $exitPath -Encoding utf8

# Extract relevant crash blocks; redact unrelated application logs.
$pattern = "FATAL EXCEPTION|Fatal signal|AndroidRuntime|ReactNativeJS|ReactNative|WebView.*crash|Render process|OutOfMemoryError|SIG(SEGV|ABRT|BUS)|Process: com\.accepted2\.molitvoslov|UnsatisfiedLinkError|NoSuchMethodError|NoClassDefFoundError|IllegalStateException|Exception in native call|JavaScriptException|libc.*Fatal"
$blocks = @(
  Get-Content -LiteralPath $crashPath | Select-String -Pattern $pattern -Context 3,35
  Get-Content -LiteralPath $mainPath | Select-String -Pattern $pattern -Context 3,30
)
$lines = New-Object System.Collections.Generic.List[string]
foreach ($block in $blocks) {
  $lines.Add("----- MATCH -----")
  foreach ($item in $block.Context.PreContext) { $lines.Add($item) }
  $lines.Add($block.Line)
  foreach ($item in $block.Context.PostContext) { $lines.Add($item) }
}
$summary = Join-Path $folder "CRASH-SUMMARY.txt"
if ($lines.Count -gt 0) {
  $lines | Select-Object -Last 280 |
    Out-File -LiteralPath $summary -Encoding utf8
  Write-Host "CRASH STACK EXTRACT:" -ForegroundColor Yellow
  Get-Content -LiteralPath $summary | Select-Object -Last 95
} else {
  "No crash signature found in current Android log buffers." |
    Out-File -LiteralPath $summary -Encoding utf8
  Write-Warning "No crash found. Open a prayer until it crashes, then re-run this script immediately."
}

Write-Host ""
Write-Host "DIAGNOSIS SAVED: $folder" -ForegroundColor Cyan
Write-Host "SHARE THIS FILE: $summary"
Write-Host "Do not share main-log-last-9000.txt unless necessary; it may include private device data."
Write-Host "NO CHANGES MADE TO THE APP OR ITS DATA."
