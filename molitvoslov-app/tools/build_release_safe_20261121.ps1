param(
  [switch]$InstallOnPhone,
  [switch]$SkipRegressionTests
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  Write-Host 'Preparing Molitvoslov Android release (ARM64, Java 17, offline texts).' -ForegroundColor Cyan

  if (!(Test-Path '.\node_modules\@babel\parser')) {
    throw 'Dependencies not found. Run npm ci first, then retry.'
  }
  if (!(Test-Path '.\android\gradlew.bat')) {
    throw 'Android native project missing. Do not use prebuild --clean; inspect the existing native setup.'
  }
  if (!(Test-Path '.\tools\verify_continue_reading_i18n_20261121.cjs')) {
    throw 'Continue Reading verification script missing. Fetch it from GitHub.'
  }

  $candidateJdks = @(
    $env:JAVA_HOME,
    'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot',
    'C:\Program Files\Eclipse Adoptium\jdk-17',
    'C:\Program Files\Java\jdk-17'
  ) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) } | Select-Object -Unique

  $jdk17 = $null
  foreach ($candidate in $candidateJdks) {
    $javaExe = Join-Path $candidate 'bin\java.exe'
    $javaInfo = & $javaExe -version 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and $javaInfo -match 'version "(?:1\.)?17\.') {
      $jdk17 = $candidate
      break
    }
  }
  if (!$jdk17) {
    throw 'JDK 17 not found. Set JAVA_HOME to the Java 17 installation (not Java 21 or 25).'
  }

  $env:JAVA_HOME = $jdk17
  $env:Path = (Join-Path $jdk17 'bin') + ';' + $env:Path
  Write-Host "Java 17: $jdk17" -ForegroundColor Green

  $sdk = if ($env:ANDROID_HOME -and (Test-Path (Join-Path $env:ANDROID_HOME 'platforms'))) {
    $env:ANDROID_HOME
  } else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  }
  if (!(Test-Path (Join-Path $sdk 'platforms\android-36'))) {
    throw "Android API 36 SDK not found: $sdk"
  }
  if (!(Test-Path (Join-Path $sdk 'ndk\27.1.12297006'))) {
    throw "Required NDK 27.1.12297006 missing: $sdk"
  }
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  $env:NODE_ENV = 'production'
  $env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = 'offline'

  $nativeProps = '.\android\local.properties'
  if (!(Test-Path $nativeProps)) {
    $sdkForGradle = $sdk.Replace('\','/')
    [IO.File]::WriteAllText((Join-Path $root 'android\local.properties'),
      "sdk.dir=$sdkForGradle" + [Environment]::NewLine,
      (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'Created Android local.properties from the installed SDK.'
  }

  & node '.\tools\verify_continue_reading_i18n_20261121.cjs'
  if ($LASTEXITCODE -ne 0) {throw 'Continue Reading source verification failed.'}

  if (!$SkipRegressionTests) {
    $tests = @(
      'test_vertical_actions_calendar_favorites_20261113.js',
      'test_calendar_public_share_20261113.js',
      'test_saint_shared_link_recovery_20261113.js',
      'test_unified_share_actions_20261114.js',
      'test_public_shared_reader_routes_20261116.js',
      'test_share_bible_saint_photo_20261113.js',
      'test_shared_content_links_20261113.js',
      'test_dual_share_release_20261113.js',
      'test_bible_lists_actions_20261113.js',
      'test_psalter_context_share_font_20261113.js',
      'test_bible_crossrefs_appearance_bookmarks_20261113.js',
      'test_android_app_links_20261113.js',
      'test_crossrefs_private_list_sharing_20261113.js'
    )
    foreach ($test in $tests) {
      $target = Join-Path '.\tools' $test
      if (!(Test-Path $target)) {
        Write-Warning "Old regression script not present, skipping: $test"
        continue
      }
      Write-Host "Regression test: $test"
      & node $target
      if ($LASTEXITCODE -ne 0) {throw "Regression test failed: $test"}
    }
  }

  $jsonPath = Join-Path $root 'app.json'
  $gradlePath = Join-Path $root 'android\app\build.gradle'
  if (!(Test-Path $gradlePath)) {throw 'Native app/build.gradle not found'}
  $json = [IO.File]::ReadAllText($jsonPath)
  $config = $json | ConvertFrom-Json
  $version = [string]$config.expo.version
  $code = [int]$config.expo.android.versionCode

  $backupDir = Join-Path (Split-Path -Parent $root) ('build-backups\release-csl-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  if ($code -eq 31 -and $version -eq '1.0.30') {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Copy-Item $jsonPath (Join-Path $backupDir 'app.json')
    if ([regex]::Matches($json,'"version"\s*:\s*"1\.0\.30"').Count -ne 1 -or
        [regex]::Matches($json,'"versionCode"\s*:\s*31').Count -ne 1) {
      throw 'Version 1.0.30 (31) is not unique; no automatic bump.'
    }
    $json = [regex]::Replace($json,'("version"\s*:\s*")1\.0\.30(")','11.0.312')
    $json = [regex]::Replace($json,'("versionCode"\s*:\s*)31\b','132')
    [IO.File]::WriteAllText($jsonPath,$json,(New-Object System.Text.UTF8Encoding($false)))
    $version = '1.0.31'
    $code = 32
    Write-Host 'Android release version bumped: 1.0.31 (32).' -ForegroundColor Green
  } elseif ($code -lt 32) {
    throw "Unexpected release version $version ($code). Refusing to replace an installed build with an older APK."
  } else {
    Write-Host "Keeping existing newer release version $version ($code)."
  }

  # Existing prebuilt native project does not automatically inherit app.json
  # version changes. Update ONLY versionCode and versionName in Gradle.
  $oldGradle = [IO.File]::ReadAllText($gradlePath)
  $codeMatches = [regex]::Matches($oldGradle,'(?m)^\s*versionCode\s+(\d+)')
  $nameMatches = [regex]::Matches($oldGradle,'(?m)^\s*versionName\s+"([^"]+)"')
  if ($codeMatches.Count -ne 1 -or $nameMatches.Count -ne 1) {
    throw 'Cannot safely identify native Android version fields.'
  }
  $nativeCode = [int]$codeMatches[0].Groups[1].Value
  if ($nativeCode -gt $code) {
    throw "Native versionCode $nativeCode exceeds app.json $code. Refusing a version downgrade."
  }
  $newGradle = [regex]::Replace($oldGradle,'(?m)^(\s*versionCode\s+)\d+','1'+$code)
  $newGradle = [regex]::Replace($newGradle,'(?m)^(\s*versionName\s+)"[^"]+"','1"'+$version+'"')
  if ($newGradle -cne $oldGradle) {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Copy-Item $gradlePath (Join-Path $backupDir 'build.gradle')
    [IO.File]::WriteAllText($gradlePath,$newGradle,
      (New-Object System.Text.UTF8Encoding($false)))
  }

  # Never reuse a smoke bundle compiled before the latest translation edits.
  New-Item -ItemType Directory -Force -Path '.\reports' | Out-Null
  Write-Host 'Exporting fresh production JS/Hermes bundle...' -ForegroundColor Cyan
  & npx.cmd expo export --platform android --output-dir '.\reports\release-js-smoke'
  if ($LASTEXITCODE -ne 0) {throw 'Metro/Expo export failed: do not build a stale APK.'}
  if (!(Test-Path '.\reports\release-js-smoke\metadata.json')) {
    throw 'Metro export metadata.json missing: aborting before Gradle.'
  }

  $syncScript = '.\tools\sync-android-app-links-20261113.ps1'
  if (Test-Path $syncScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript
    if ($LASTEXITCODE -ne 0) {throw 'Android App Links manifest synchronization failed.'}
  }

  $started = Get-Date
  $status = -1
  Push-Location '.\android'
  try {
    Write-Host 'Building ARM64 release APK (two Gradle workers; no clean/prebuild)...' -ForegroundColor Cyan
    & '.\gradlew.bat' ':app:assembleRelease' '-PreactNativeArchitectures=arm64-v8a' '--no-daemon' '--max-workers=2'
    $status = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($status -ne 0) {
    $diagnostic = '.\tools\diagnose-nitro-ninja-20261114.ps1'
    if (Test-Path $diagnostic) {
      Write-Warning 'Gradle failed: checking Nitro CMake/Ninja timestamps without deleting its cache.'
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $diagnostic
    }
    throw "Gradle release build failed (exit code $status)."
  }

  $sourceApk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
  if (!(Test-Path $sourceApk)) {throw "Gradle finished without expected release APK: $sourceApk"}
  if ((Get-Item $sourceApk).LastWriteTime -lt $started.AddSeconds(-30)) {
    throw 'Found an old APK rather than a newly rebuilt artifact.'
  }
  $releaseApk = Join-Path $root ("reports\molitvoslov-{0}-{1}.apk" -f $version,$code)
  Copy-Item $sourceApk $releaseApk -Force
  Write-Host "NEW APK: $releaseApk" -ForegroundColor Green
  Get-FileHash $releaseApk -Algorithm SHA256 | Format-Table -AutoSize

  # Do not require a live Render server: a previous 503 caused confusion,
  # even though the local release compilation was successful.
  $signatureCheck = '.\tools\check-android-app-links-20261113.ps1'
  if (Test-Path $signatureCheck) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $signatureCheck -ApkPath $releaseApk
    if ($LASTEXITCODE -ne 0) {throw 'APK built, but signature verification failed.'}
  }

  if ($InstallOnPhone) {
    $adb = Join-Path $sdk 'platform-tools\adb.exe'
    if (!(Test-Path $adb)) {throw "adb.exe missing: $adb"}
    $devices = @(& $adb devices | Where-Object {$_ -match '^\S+\s+device$'})
    if ($devices.Count -ne 1) {
      throw 'Connect exactly one authorized Android phone for upgrade.'
    }
    & $adb install -r $releaseApk
    if ($LASTEXITCODE -ne 0) {
      throw 'adb install -r failed. Do not uninstall the existing app or erase user data.'
    }
    Write-Host 'Installed over the existing application without clearing local data.' -ForegroundColor Green
  }
  Write-Host 'RELEASE COMPLETE. Check the Church Slavonic main card, Continue Reading list, and calendar on the phone.' -ForegroundColor Green
}
finally {
  Pop-Location
}
