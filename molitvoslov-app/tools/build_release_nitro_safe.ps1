# Nitro/CMake-safe Android release build for Molitvoslov on Windows.
# Never builds the unstable armeabi-v7a ABI.
# Does NOT run expo prebuild --clean, git clean, npm ci, or uninstall the main app.
param(
  [ValidateSet('Emulator', 'Arm64')]
  [string]$Target = 'Emulator',
  [switch]$Install,
  [switch]$RemoveExtras
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$android = Join-Path $root 'android'
$gradlew = Join-Path $android 'gradlew.bat'
$apk = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'
$reports = Join-Path $root 'reports'

function Check-Exit([string]$label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit code $LASTEXITCODE). Installed app was not removed."
  }
}

if (-not (Test-Path -LiteralPath $gradlew)) {
  throw 'Android Gradle wrapper is missing. Do not regenerate the Android project automatically.'
}
if (-not (Test-Path -LiteralPath $adb)) {
  throw "Android ADB is missing: $adb"
}
if ($RemoveExtras -and (-not $Install -or $Target -ne 'Emulator')) {
  throw '-RemoveExtras is permitted only with -Target Emulator -Install.'
}

$serial = $null
$architecture = 'arm64-v8a'
if ($Target -eq 'Emulator') {
  $deviceLines = @(& $adb devices | Where-Object { $_ -match '^emulator-\d+\s+device\s*$' })
  Check-Exit 'adb devices'
  if ($deviceLines.Count -ne 1) {
    throw "Expected exactly one running Android emulator; found $($deviceLines.Count)."
  }
  $serial = ($deviceLines[0] -split '\s+')[0]
  $abiList = [string]((& $adb -s $serial shell getprop ro.product.cpu.abilist) -join '')
  Check-Exit 'Emulator ABI detection'
  if ($abiList -match '(^|,)x86_64(,|$)') {
    $architecture = 'x86_64'
  } elseif ($abiList -match '(^|,)arm64-v8a(,|$)') {
    $architecture = 'arm64-v8a'
  } else {
    throw "Unsupported emulator ABI: $abiList. Will not try broken armeabi-v7a."
  }
}

Push-Location $root
try {
  $config = Get-Content -LiteralPath (Join-Path $root 'app.json') -Raw -Encoding UTF8 |
    ConvertFrom-Json
  if ($config.expo.android.package -ne 'com.accepted2.molitvoslov') {
    throw "Unexpected Android package: $($config.expo.android.package)"
  }

  Write-Host "RELEASE TARGET: $Target; ABI: $architecture" -ForegroundColor Cyan
  Write-Host "VERSION: $($config.expo.version) ($($config.expo.android.versionCode))"

  if (Test-Path -LiteralPath (Join-Path $root 'tools\test_calendar_release_only_20261123.cjs')) {
    & node 'tools/test_calendar_release_only_20261123.cjs'
    Check-Exit 'Offline calendar release test'
  }
  if (Test-Path -LiteralPath (Join-Path $root 'tools\test_calendar_day_rollover_20261118.js')) {
    & node 'tools/test_calendar_day_rollover_20261118.js'
    Check-Exit 'Calendar rollover test'
  }

  Write-Host 'Preparing bundled search data...' -ForegroundColor Cyan
  & npm.cmd run search:prepare
  Check-Exit 'Search preflight'

  New-Item -ItemType Directory -Force -Path $reports | Out-Null
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  if (Test-Path -LiteralPath $apk) {
    $prior = Join-Path $reports "previous-release-before-nitro-$timestamp.apk"
    Copy-Item -LiteralPath $apk -Destination $prior
    Write-Host "Previous APK backed up: $prior"
  }

  Push-Location $android
  try {
    Write-Host 'Stopping Gradle workers before targeted Nitro CMake reset...' -ForegroundColor Cyan
    & $gradlew --stop
    Check-Exit 'Gradle stop'
  } finally {
    Pop-Location
  }

  # This specific cache reset and ABI restriction were part of a
  # previously successful workaround. Keep all app source and user data.
  $cachePaths = @(
    (Join-Path $root 'node_modules\react-native-nitro-google-signin\android\.cxx'),
    (Join-Path $android 'build\intermediates\cxx')
  )
  foreach ($cache in $cachePaths) {
    if (Test-Path -LiteralPath $cache) {
      Write-Host "Resetting generated native cache: $cache" -ForegroundColor Yellow
      Remove-Item -LiteralPath $cache -Force -Recurse
    }
  }

  Write-Host "Building release APK with -PreactNativeArchitectures=$architecture" -ForegroundColor Cyan
  Push-Location $android
  try {
    & $gradlew ':app:assembleRelease' "-PreactNativeArchitectures=$architecture" '--no-daemon' '--max-workers=2'
    Check-Exit 'Gradle release build'
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $apk)) {
    throw "No APK produced: $apk"
  }
  $output = Join-Path $reports "molitvoslov-$($config.expo.version)-$($config.expo.android.versionCode)-$architecture-$timestamp.apk"
  Copy-Item -LiteralPath $apk -Destination $output -Force
  $sha = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
  Write-Host "BUILD SUCCESS: $output" -ForegroundColor Green
  Write-Host "SHA256: $sha"

  if ($Install) {
    if ($Target -ne 'Emulator') {
      throw 'Automatic installation is supported only for the selected emulator.'
    }
    Write-Host "Installing APK over existing app on $serial (preserve app data)..." -ForegroundColor Cyan
    $installResult = @(& $adb -s $serial install -r $output)
    Check-Exit 'ADB install'
    $installResult | ForEach-Object { Write-Host $_ }
    if (-not (($installResult -join [Environment]::NewLine) -match 'Success')) {
      throw 'ADB did not confirm installation. Existing apps were not removed.'
    }

    $main = @(& $adb -s $serial shell pm path com.accepted2.molitvoslov)
    Check-Exit 'Main application verification'
    if (-not (($main -join [Environment]::NewLine) -match 'package:')) {
      throw 'Main application is not installed. Do not remove other applications.'
    }

    if ($RemoveExtras) {
      foreach ($oldPackage in @('com.accepted2.molitvoslov.dev', 'host.exp.exponent')) {
        $installed = @(& $adb -s $serial shell pm path $oldPackage)
        if (($installed -join [Environment]::NewLine) -match 'package:') {
          Write-Host "Uninstalling extra app: $oldPackage" -ForegroundColor Yellow
          & $adb -s $serial uninstall $oldPackage
          Check-Exit "Uninstall $oldPackage"
        }
      }
    }
    & $adb -s $serial shell monkey -p com.accepted2.molitvoslov -c android.intent.category.LAUNCHER 1
    Check-Exit 'Launch main application'
    Write-Host 'ONE MAIN APP INSTALLED AND LAUNCHED' -ForegroundColor Green
  }
} finally {
  Pop-Location
}
