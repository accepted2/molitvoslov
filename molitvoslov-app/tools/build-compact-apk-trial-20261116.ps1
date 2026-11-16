# Evaluate APK size optimizations in the proven native Android checkout.
# NO original sources, personal data, search DB, calendar JSON, fonts, images,
# signing keys or prior APKs are deleted or replaced.
# The ONLY build output replaced is Gradle's normal intermediate app-release.apk.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-compact-apk-trial-20261116.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-compact-apk-trial-20261116.ps1 -Mode R8
# Leave normal 1.0.30 (31) installed on your phone until the trial is tested.
param(
  [ValidateSet('CompactNative','R8')]
  [string]$Mode = 'CompactNative',
  [string]$BaselineApk = ''
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$reportDir = Join-Path $root 'reports'
$config = Get-Content -LiteralPath (Join-Path $root 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$config.expo.version
$versionCode = [int]$config.expo.android.versionCode
$defaultBaseline = Join-Path $reportDir ("molitvoslov-$version-$versionCode.apk")
if (-not $BaselineApk) { $BaselineApk = $defaultBaseline }
if (-not (Test-Path -LiteralPath $BaselineApk)) {
  throw "Baseline APK missing: $BaselineApk. Build and save the tested release before measuring optimization."
}
$baselineFile = (Resolve-Path -LiteralPath $BaselineApk).Path
$baselineSize = (Get-Item -LiteralPath $baselineFile).Length
$gradle = Join-Path $root 'android\gradlew.bat'
$appGradle = Join-Path $root 'android\app\build.gradle'
if (-not (Test-Path -LiteralPath $gradle) -or
    -not (Test-Path -LiteralPath $appGradle)) {
  throw 'Native Android project not found. Use the previously working build folder.'
}
$gradleContent = Get-Content -LiteralPath $appGradle -Raw -Encoding UTF8
if ($gradleContent -notmatch 'expo\.useLegacyPackaging') {
  throw 'Native build.gradle does not recognize expo.useLegacyPackaging. No build started.'
}
if ($Mode -eq 'R8' -and (
  $gradleContent -notmatch 'android\.enableShrinkResourcesInReleaseBuilds' -or
  $gradleContent -notmatch 'android\.enableMinifyInReleaseBuilds')) {
  throw 'Native build.gradle does not recognize both R8 release flags. No build started.'
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
  throw 'node_modules missing; do not run npm ci or modify dependencies as part of this size trial.'
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = 'offline'
$flags = @(':app:assembleRelease', '--no-daemon',
  '-PreactNativeArchitectures=arm64-v8a', '-Pexpo.useLegacyPackaging=true')
if ($Mode -eq 'R8') {
  $flags += @('-Pandroid.enableMinifyInReleaseBuilds=true',
              '-Pandroid.enableShrinkResourcesInReleaseBuilds=true')
}
Write-Host "APP: $version ($versionCode), ARM64-only" -ForegroundColor Cyan
Write-Host ("BASELINE: " + $baselineFile + " (" + [Math]::Round($baselineSize/1MB,2) + " MiB)") -ForegroundColor Cyan
Write-Host ("TRIAL MODE: " + $Mode) -ForegroundColor Yellow
Write-Host 'Using existing native Android, bundled calendar/search/Bible and unchanged signed release configuration.'
Write-Host 'Rebuilding JS to ensure trial uses current app content. No expo prebuild, npm ci or clean.'
Push-Location (Join-Path $root 'android')
try {
  & .\gradlew.bat @flags
  $exitCode = $LASTEXITCODE
} finally { Pop-Location }
if ($exitCode -ne 0) {
  throw "Experimental Gradle build failed with exit code $exitCode; tested baseline remains untouched."
}
$generated = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $generated)) { throw "Generated APK not found: $generated" }
$modeName = if ($Mode -eq 'R8') {'r8-compact-native'} else {'compact-native'}
$trial = Join-Path $reportDir ("size-trial-$modeName-$version-$versionCode.apk")
if ([string]::Equals($trial,$baselineFile,[StringComparison]::OrdinalIgnoreCase)) {
  throw 'Trial output path must never equal baseline.'
}
Copy-Item -LiteralPath $generated -Destination $trial -Force
$trialBytes = (Get-Item -LiteralPath $trial).Length
$delta = $trialBytes - $baselineSize
$percent = [math]::Round(($baselineSize-$trialBytes) / $baselineSize * 100, 2)
$deltaMib = [math]::Round($delta / 1MB, 2)
Write-Host ''
Write-Host 'APK SIZE COMPARISON' -ForegroundColor Cyan
[pscustomobject]@{
  BaselineMiB = [math]::Round($baselineSize/1MB,2)
  TrialMiB = [math]::Round($trialBytes/1MB,2)
  DeltaMiB = $deltaMib
  ReducedPercent = $percent
  Mode = $Mode
} | Format-Table -AutoSize
Write-Host ("BASELINE PRESERVED: " + $baselineFile) -ForegroundColor Green
Write-Host ("TRIAL APK: " + $trial) -ForegroundColor Green
Get-FileHash -LiteralPath $trial -Algorithm SHA256 | Format-List
# Check native library compression in the generated APK to confirm this mode
# took effect. It should have compressed JNI .so entries in CompactNative mode.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($trial)
try {
  $nativeLibs = @($zip.Entries | Where-Object {
    $_.FullName -match '^lib/arm64-v8a/.*\.so$'
  })
  if (-not $nativeLibs.Count) {
    throw 'No ARM64 .so files found. Check ABI packaging.'
  }
  $rawBytes = [double](($nativeLibs | Measure-Object Length -Sum).Sum)
  $packedBytes = [double](($nativeLibs | Measure-Object CompressedLength -Sum).Sum)
  Write-Host ("ARM64 native libraries: " + $nativeLibs.Count +
    " files; stored " + [math]::Round($packedBytes/1MB,2) +
    " MiB from " + [math]::Round($rawBytes/1MB,2) + " MiB raw.")
  if ($packedBytes -ge $rawBytes * 0.98) {
    Write-Warning 'JNI libraries are not substantially compressed. Gradle may not have honored packaging override.'
  }
} finally { $zip.Dispose() }
$analyze = Join-Path $PSScriptRoot 'analyze-apk-size-20261113.ps1'
if (Test-Path -LiteralPath $analyze) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $analyze -ApkPath $trial -PreviousApk $baselineFile
  if ($LASTEXITCODE -ne 0) { throw 'The APK comparison analyzer failed.' }
}
Write-Host 'DO NOT replace the installed baseline until this trial is smoke-tested on a real device.' -ForegroundColor Yellow
