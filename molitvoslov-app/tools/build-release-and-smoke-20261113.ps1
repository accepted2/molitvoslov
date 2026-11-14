param(
  [switch]$InstallOnPhone,
  [switch]$SkipTests,
  [switch]$SkipSmokeExport,
  [switch]$SkipPrebuild,
  [switch]$Arm64Only
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $config = Get-Content ".\app.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = $config.expo.version
  $versionCode = [int]$config.expo.android.versionCode
  Write-Host "Molitvoslov release $version ($versionCode)" -ForegroundColor Cyan

  if (-not (Test-Path ".\node_modules")) {
    throw "node_modules not found. Run npm ci in molitvoslov-app."
  }

  if (-not $SkipTests) {
    $tests = @(
      "test_vertical_actions_calendar_favorites_20261113.js",
      "test_calendar_public_share_20261113.js",
      "test_saint_shared_link_recovery_20261113.js",
      "test_unified_share_actions_20261114.js",
      "test_share_bible_saint_photo_20261113.js",
      "test_shared_content_links_20261113.js",
      "test_dual_share_release_20261113.js",
      "test_bible_lists_actions_20261113.js",
      "test_psalter_context_share_font_20261113.js",
      "test_bible_crossrefs_appearance_bookmarks_20261113.js",
      "test_android_app_links_20261113.js",
      "test_crossrefs_private_list_sharing_20261113.js"
    )
    foreach ($test in $tests) {
      Write-Host "TEST: $test"
      & node ".\tools\$test"
      if ($LASTEXITCODE -ne 0) {
        throw "Regression test failed: $test"
      }
    }
  }

  New-Item -ItemType Directory -Force -Path ".\reports" | Out-Null
  if ($SkipSmokeExport) {
    if (-not (Test-Path ".\reports\release-js-smoke\metadata.json")) {
      throw "No previous Metro smoke export to reuse. Re-run without -SkipSmokeExport."
    }
    Write-Host "Reusing previously successful Metro smoke export." -ForegroundColor Cyan
  } else {
    Write-Host "Exporting Android production JavaScript bundle..." -ForegroundColor Cyan
    & npx.cmd expo export --platform android --output-dir ".\reports\release-js-smoke"
    if ($LASTEXITCODE -ne 0) { throw "Expo could not export the Android JavaScript bundle." }
  }

  if (-not (Test-Path ".\android\gradlew.bat")) {
    if ($SkipPrebuild) { throw "android\gradlew.bat does not exist and -SkipPrebuild was specified." }
    Write-Host "Generating Android native project (without --clean)..." -ForegroundColor Cyan
    & npx.cmd expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw "Expo prebuild failed." }
  }

  # Existing native Android directories are not regenerated/cleaned: keep
  # custom widget and Kotlin changes. Synchronize only release version fields.
  $buildGradle=Join-Path $root "android\app\build.gradle"
  if (Test-Path $buildGradle) {
    $nativeConfig=[IO.File]::ReadAllText($buildGradle)
    $updatedConfig=[regex]::Replace($nativeConfig,
      '(?m)^(\s*versionCode\s+)\d+', ('${1}'+[string]$versionCode))
    $updatedConfig=[regex]::Replace($updatedConfig,
      '(?m)^(\s*versionName\s+)"[^"]+"', ('${1}"'+$version+'"'))
    if ($nativeConfig -ne $updatedConfig) {
      [IO.File]::WriteAllText($buildGradle,$updatedConfig,
        (New-Object System.Text.UTF8Encoding($false)))
      Write-Host "Updated native Gradle version to $version ($versionCode)"
    }
  }

  # Expo config does not automatically modify an already-generated android/
  # folder. Register HTTPS verification without overwriting native widgets.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\sync-android-app-links-20261113.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Android App Links manifest sync failed." }

  # Do NOT delete react-native-nitro-google-signin/android/.cxx here:
  # deleting it did not fix the endless build.ninja regeneration, and erases
  # Ninja's evidence of which CMake dependency has a bad timestamp.
  # The read-only diagnostic script can show the exact problematic input.
  $nitroModuleAndroid = Join-Path $root "node_modules\react-native-nitro-google-signin\android"
  $nitroCmakeLists = Join-Path $nitroModuleAndroid "CMakeLists.txt"
  if (Test-Path -LiteralPath $nitroCmakeLists) {
    $inputTime = (Get-Item -LiteralPath $nitroCmakeLists).LastWriteTimeUtc
    if ($inputTime -gt [DateTime]::UtcNow.AddMinutes(2)) {
      Write-Warning "NitroGoogleSignin CMakeLists.txt has a future timestamp ($inputTime UTC). Diagnose before rebuilding."
    }
  }

  Write-Host "Building Android release APK..." -ForegroundColor Cyan
  # Gradle looks for settings.gradle in the current working directory.
  # Running android/gradlew.bat from the Expo root does NOT change that directory.
  # Preserve existing native Android files, Kotlin and widgets.
  $androidDir = Join-Path $root "android"
  $gradleExitCode = -1
  $gradleArgs = @(":app:assembleRelease", "--no-daemon")
  if ($Arm64Only) {
    # ARM64-only fallback when the 32-bit CMake/Ninja build is broken.
    # For a universal release, build without -Arm64Only after fixing CMake.
    $gradleArgs += "-PreactNativeArchitectures=arm64-v8a"
    Write-Host "Building ARM64-only APK (not compatible with 32-bit Android phones)." -ForegroundColor Yellow
  }
  Push-Location $androidDir
  try {
    & ".\gradlew.bat" @gradleArgs
    $gradleExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($gradleExitCode -ne 0) {
    $nitroNinjaDiag = Join-Path $root "tools\diagnose-nitro-ninja-20261114.ps1"
    if (Test-Path -LiteralPath $nitroNinjaDiag) {
      Write-Host "Diagnosing Nitro CMake/Ninja timestamps after failed Gradle build..." -ForegroundColor Yellow
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $nitroNinjaDiag
    }
    throw "Gradle assembleRelease failed (exit code $gradleExitCode)."
  }

  $apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path $apk)) { throw "Release APK was not found: $apk" }
  $outputDir=Join-Path $root "reports"
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  $releaseApk=Join-Path $outputDir "molitvoslov-$version-$versionCode.apk"
  Copy-Item $apk $releaseApk -Force
  Write-Host "APK: $releaseApk" -ForegroundColor Green
  Get-FileHash $releaseApk -Algorithm SHA256 | Format-Table -AutoSize

  # Print the actual APK certificate SHA-256 to configure Render assetlinks.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\check-android-app-links-20261113.ps1" -ApkPath $releaseApk -CheckServer
  if ($LASTEXITCODE -ne 0) { throw "APK certificate inspection failed." }

  if ($InstallOnPhone) {
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
      throw "adb was not found on PATH. Install Android SDK platform-tools."
    }
    $devices = @(& adb devices)
    $connected = @($devices | Where-Object { $_ -match "^\S+\s+device$" })
    if ($connected.Count -ne 1) {
      throw "Connect exactly one Android device with USB debugging authorized."
    }
    & adb install -r $releaseApk
    if ($LASTEXITCODE -ne 0) {
      throw "Installation failed. Do NOT uninstall the existing app: that could delete local data."
    }
    & adb shell am start -n "com.accepted2.molitvoslov/.MainActivity"
    if ($LASTEXITCODE -ne 0) {
      Write-Host "APK is installed. Launch the app manually." -ForegroundColor Yellow
    }
    Write-Host "Installed. Manually check navigation, sharing links and Favorites." -ForegroundColor Green
  }
} finally {
  Pop-Location
}
