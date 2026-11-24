# Local, non-destructive ARM64 Android release APK build for Molitvoslov.
# Run from molitvoslov-app root with -PythonExe set to a working python.exe path.
# No version rewriting. No app uninstall. Preserves local source changes and old APK.
param(
    [string]$PythonExe,
    [string]$OldSearchSeed = "..\build-backups\search-seed-before-apk-20261117_174405.db"
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Assert-Exit([string]$label) {
    if ($LASTEXITCODE -ne 0) {
        throw "$label failed (exit code $LASTEXITCODE). Original APK and user data preserved."
    }
}

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    $PythonExe = $env:MOLITVOSLOV_PYTHON
}
if ([string]::IsNullOrWhiteSpace($PythonExe) -or -not (Test-Path -LiteralPath $PythonExe)) {
    throw "Specify -PythonExe with a working python.exe path."
}
$PythonExe = (Resolve-Path -LiteralPath $PythonExe).Path
& $PythonExe --version
Assert-Exit "Python version"
$env:MOLITVOSLOV_PYTHON = $PythonExe
$env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = "offline"

if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
    $knownJava = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
    if (Test-Path -LiteralPath (Join-Path $knownJava "bin\java.exe")) {
        $env:JAVA_HOME = $knownJava
    }
}
if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
    $env:Path = (Join-Path $env:JAVA_HOME "bin") + ";" + $env:Path
}
if ([string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = (Join-Path $env:ANDROID_HOME "platform-tools") + ";" + $env:Path

$appConfig = Get-Content (Join-Path $root "app.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$versionName = [string]$appConfig.expo.version
$versionCode = [int]$appConfig.expo.android.versionCode
$packageId = [string]$appConfig.expo.android.package
if ($packageId -ne "com.accepted2.molitvoslov") {
    throw "Unexpected Android application ID: $packageId. No build performed."
}
$gradleFile = Join-Path $root "android\app\build.gradle"
if (-not (Test-Path -LiteralPath $gradleFile)) {
    throw "Local android/app/build.gradle is missing; do not regenerate the native project without review."
}
$gradleText = Get-Content -LiteralPath $gradleFile -Raw -Encoding UTF8
$gradleCode = [regex]::Match($gradleText, '(?m)^\s*versionCode\s+(\d+)\b')
$gradleName = [regex]::Match($gradleText, '(?m)^\s*versionName\s+["'']([^"'']+)["'']')
if (-not $gradleCode.Success -or -not $gradleName.Success) {
    throw "Cannot validate versionCode/versionName in android/app/build.gradle; check before building."
}
if ([int]$gradleCode.Groups[1].Value -ne $versionCode -or
    $gradleName.Groups[1].Value -ne $versionName) {
    $details = "Version mismatch: app.json={0} ({1}) but Gradle={2} ({3})." -f (
        $versionName, $versionCode, $gradleName.Groups[1].Value,
        $gradleCode.Groups[1].Value
    )
    throw "$details Do not build a possibly downgraded APK."
}
Write-Host "VERSION VERIFIED: $versionName ($versionCode), $packageId"

if (-not (Test-Path -LiteralPath ".\node_modules\expo-notifications\package.json")) {
    throw "expo-notifications is not installed. Install dependencies before building."
}
if (-not (Test-Path -LiteralPath ".\android\gradlew.bat")) {
    throw "Gradle wrapper is missing. No changes made."
}
$priorSearch = (Resolve-Path -LiteralPath $OldSearchSeed).Path

$backupDir = Join-Path (Split-Path -Parent $root) (
    "build-backups\phone-apk-before-" + (Get-Date -Format "yyyyMMdd_HHmmss")
)
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item (Join-Path $root "app.json") (Join-Path $backupDir "app.json")
Copy-Item $gradleFile (Join-Path $backupDir "build.gradle")
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path -LiteralPath $apk) {
    Copy-Item $apk (Join-Path $backupDir "previous-app-release.apk")
}
Write-Host "PREVIOUS RELEASE BACKUP: $backupDir"

Write-Host "[1/5] Verify reminders and calendar search compatibility"
node .\tools\test_local_prayer_reminders_20261117.js
Assert-Exit "Local reminders test"
& $PythonExe -X utf8 ".\tools\test_calendar_language_fallback_20261117.py"
Assert-Exit "Calendar language fallback test"

Write-Host "[2/5] Verify current offline content and exact search-index parity"
node .\scripts\prepare-search-index.js --verify-only
Assert-Exit "Offline search verification"
& $PythonExe -X utf8 ".\tools\verify_search_calendar_parity_20261117.py" --old $priorSearch
Assert-Exit "Old vs new search compatibility"
node .\scripts\copy-search-seed.js
Assert-Exit "Search seed Metro verification"
if (Test-Path -LiteralPath ".\android\app\src\main\assets\search_seed.db") {
    throw "Duplicate native search_seed.db still exists. Do not bundle two search databases."
}

Write-Host "[3/5] Build clean ARM64 release APK (no Android app data modified)"
Push-Location (Join-Path $root "android")
try {
    & .\gradlew.bat :app:clean :app:assembleRelease "-PreactNativeArchitectures=arm64-v8a" --no-daemon
    Assert-Exit "Android release Gradle build"
} finally {
    Pop-Location
}
if (-not (Test-Path -LiteralPath $apk)) {
    throw "Release APK was not produced at: $apk"
}

Write-Host "[4/5] Verify embedded SQLite index and APK source content"
& $PythonExe -X utf8 ".\tools\diagnose_release_apk.py" --strict
Assert-Exit "Embedded APK offline content check"

Write-Host "[5/5] Copy verified APK to reports without overwriting previous build"
$reports = Join-Path $root "reports"
New-Item -ItemType Directory -Force -Path $reports | Out-Null
$filename = "molitvoslov-local-" + $versionName + "-" + $versionCode +
    "-arm64-" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".apk"
$destination = Join-Path $reports $filename
Copy-Item -LiteralPath $apk -Destination $destination
$checksum = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
Write-Host "BUILD VERIFIED: $versionName ($versionCode)"
Write-Host "APK: $destination"
Write-Host "SIZE MiB: $([Math]::Round((Get-Item $destination).Length / 1MB, 2))"
Write-Host "SHA256: $checksum"
Write-Host "OLD APK BACKUP: $backupDir"
Write-Host "Install over existing app; do not uninstall or clear storage."
