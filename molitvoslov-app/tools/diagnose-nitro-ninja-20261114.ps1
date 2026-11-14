# Diagnose endless CMake/Ninja build.ninja regeneration in NitroGoogleSignin.
# Read-only by default; never deletes caches, app data, or signing keys.
param([switch]$RepairFutureProjectInputs)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$moduleAndroid = Join-Path $root 'node_modules\react-native-nitro-google-signin\android'
$cache = Join-Path $moduleAndroid '.cxx'
$reports = Join-Path $root 'reports'
New-Item -ItemType Directory -Path $reports -Force | Out-Null
$report = Join-Path $reports 'nitro-ninja-diagnosis-20261114.txt'
Write-Host ('Local time: ' + (Get-Date).ToString('o'))
Write-Host ('UTC time:   ' + [DateTime]::UtcNow.ToString('o'))
if (-not (Test-Path -LiteralPath $moduleAndroid)) { throw "Nitro module not found: $moduleAndroid" }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$ninja = Join-Path $env:ANDROID_HOME 'cmake\3.22.1\bin\ninja.exe'
if (-not (Test-Path -LiteralPath $ninja)) { throw "Ninja not found: $ninja" }
& $ninja --version
$clock = [DateTime]::UtcNow
$future = @()
$scan = @(
  $moduleAndroid,
  (Join-Path $env:ANDROID_HOME 'cmake\3.22.1\share'),
  (Join-Path $env:ANDROID_HOME 'ndk\27.1.12297006\build\cmake')
)
foreach ($dir in $scan) {
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  Write-Host "Scanning future timestamps: $dir" -ForegroundColor Cyan
  $future += @(Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -gt $clock.AddMinutes(2) })
}
if ($future.Count) {
  Write-Warning "$($future.Count) files have LastWriteTime UTC in the FUTURE."
  $future | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 30 FullName,LastWriteTimeUtc | Format-Table -Wrap | Out-String | Write-Host
  if ($RepairFutureProjectInputs) {
    $projectFuture = @($future | Where-Object {
      $_.FullName.StartsWith($moduleAndroid + '\', [StringComparison]::OrdinalIgnoreCase)
    })
    $backup = Join-Path $reports 'nitro-future-timestamps-before-repair-20261114.csv'
    $projectFuture | Select-Object FullName,LastWriteTimeUtc | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $backup
    foreach ($file in $projectFuture) { $file.LastWriteTimeUtc = $clock.AddSeconds(-5) }
    Write-Host "Adjusted only $($projectFuture.Count) future-dated Nitro files; timestamps saved to $backup" -ForegroundColor Green
    Write-Host 'Android SDK/NDK files were NOT modified.'
  } else {
    Write-Host 'No timestamp changes were made. Use -RepairFutureProjectInputs only if needed.'
  }
} else { Write-Host 'No future timestamps in scanned paths.' -ForegroundColor Green }
if (-not (Test-Path -LiteralPath $cache)) {
  Write-Warning "No .cxx cache at $cache. Run ONLY the failing Gradle task, then run this diagnostic."
  exit 0
}
$manifests = @(Get-ChildItem -LiteralPath $cache -Filter 'build.ninja' -File -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\RelWithDebInfo\\[^\\]+\\arm64-v8a\\build\.ninja$' } |
  Sort-Object LastWriteTimeUtc -Descending)
if (-not $manifests.Count) { Write-Warning 'No ARM64 release build.ninja found; first run targeted Gradle task.'; exit 0 }
$manifest = $manifests[0]
Write-Host ('Manifest: ' + $manifest.FullName) -ForegroundColor Cyan
Write-Host ('Modified: ' + $manifest.LastWriteTimeUtc.ToString('o') + ' UTC')
$stdout = Join-Path $reports 'nitro-ninja-stdout-20261114.txt'
$stderr = Join-Path $reports 'nitro-ninja-stderr-20261114.txt'
# -n dry run; -d explain prints which dependency is newer than build.ninja.
$arguments = '-C "' + $manifest.DirectoryName + '" -n -d explain NitroGoogleSignin'
Write-Host ('Diagnosing: ' + $ninja + ' ' + $arguments) -ForegroundColor Cyan
$process = Start-Process -FilePath $ninja -ArgumentList $arguments -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$outLines = @(Get-Content -LiteralPath $stdout -ErrorAction SilentlyContinue)
$errLines = @(Get-Content -LiteralPath $stderr -ErrorAction SilentlyContinue)
@('UTC: ' + [DateTime]::UtcNow.ToString('o'), 'Manifest: ' + $manifest.FullName,
  'Ninja exit: ' + $process.ExitCode, 'Future-dated files: ' + $future.Count,
  '', '--- Ninja stderr ---', $errLines, '', '--- Ninja stdout ---', $outLines) |
  Set-Content -LiteralPath $report -Encoding UTF8
Write-Host '--- Ninja dependency explanation ---' -ForegroundColor Yellow
$errLines | Select-Object -First 55 | ForEach-Object { Write-Host $_ }
$outLines | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
Write-Host ('Full report: ' + $report) -ForegroundColor Cyan
Write-Host 'Look for lines beginning ninja explain: to identify the newer input.'
