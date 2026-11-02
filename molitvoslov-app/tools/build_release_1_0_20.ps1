# Molitvoslov: build a stable compact Android ARM64 release 1.0.20 (21).
# From app root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build_release_1_0_20.ps1
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Assert-Command([string]$context) {
  if ($LASTEXITCODE -ne 0) { throw "$context failed (exit code $LASTEXITCODE)" }
}

$python = "C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Python venv missing: $python" }

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:MOLITVOSLOV_PYTHON = $python
$env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = "offline"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

Write-Host "[1/5] Apply gradient and SQLite fixes"
& $python -X utf8 ".\tools\apply_persistent_reader_gradient.py"
Assert-Command "Persistent reader gradient patch"
& $python -X utf8 ".\tools\apply_sqlite_crash_fix.py"
Assert-Command "SQLite crash patch"

$gradient = [IO.File]::ReadAllText((Join-Path $root "src\components\navigation\FixedSectionHeader.js"))
$search = [IO.File]::ReadAllText((Join-Path $root "src\screens\SearchScreen.js"))
if (-not $gradient.Contains("styles.fixedGradient") -or -not $gradient.Contains("fixedGradient:")) {
  throw "Persistent reader gradient not found"
}
if (-not $search.Contains("options={SEARCH_SQLITE_OPTIONS}") -or
    -not $search.Contains("finalizeUnusedStatementsBeforeClosing: false")) {
  throw "Stable SQLite crash fix missing"
}

Write-Host "[2/5] Back up prior APK and version files"
$backupDir = Join-Path (Split-Path -Parent $root) ("build-backups\release-1.0.20-" + (Get-Date -Format "yyyyMMdd_HHmmss"))
New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
$appJson = Join-Path $root "app.json"
$gradleFile = Join-Path $root "android\app\build.gradle"
Copy-Item $appJson (Join-Path $backupDir "app.json")
Copy-Item $gradleFile (Join-Path $backupDir "build.gradle")
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apk) {
  Copy-Item $apk (Join-Path $backupDir "app-release-before-1.0.20.apk")
}

Write-Host "[3/5] Restore malformed version files if needed; set UTF-8 version 1.0.20 (21)"
& $python -X utf8 ".\tools\repair_release_version_1_0_20.py"
Assert-Command "Version and configuration repair"

Write-Host "[4/5] Check single bundled offline search database"
node .\scripts\copy-search-seed.js
Assert-Command "Search seed verification"
if (Test-Path ".\android\app\src\main\assets\search_seed.db") {
  throw "Duplicate native search DB exists; aborting build"
}
& git diff --check
Assert-Command "Whitespace verification"

Write-Host "[5/5] Build ARM64 release APK"
Push-Location (Join-Path $root "android")
try {
  & .\gradlew.bat :app:clean :app:assembleRelease "-PreactNativeArchitectures=arm64-v8a" --no-daemon
  Assert-Command "Gradle release"
} finally {
  Pop-Location
}

if (-not (Test-Path $apk)) { throw "Release APK not found: $apk" }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($apk)
try {
  $databases = @($zip.Entries | Where-Object { $_.FullName -match '\.db$' })
  $abis = @($zip.Entries | Where-Object { $_.FullName -match '^lib/[^/]+/' } |
    ForEach-Object { $_.FullName.Split('/')[1] } | Sort-Object -Unique)
  if ($databases.Count -ne 1 -or $databases[0].FullName -match '^assets/' -or
      $abis.Count -ne 1 -or $abis[0] -ne 'arm64-v8a') {
    throw "APK contains unexpected SQLite databases or processor libraries"
  }
  Write-Host "BUILD VERIFIED:"
  Write-Host "  Version: 1.0.20 (21)"
  Write-Host "  APK: $apk"
  Write-Host "  Size: $([math]::Round((Get-Item $apk).Length / 1MB, 2)) MiB"
  Write-Host "  Search DB: $($databases[0].FullName)"
  Write-Host "  ABI: $($abis[0])"
  Write-Host "  Previous APK backup: $backupDir"
  Write-Host "Install on an ARM64 phone over the existing app, without uninstalling."
} finally {
  $zip.Dispose()
}
