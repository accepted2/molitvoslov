# Молитвослов: build an ARM64 phone APK with all 17 pixel-identical WebP images.
# Run from C:\m\molitvoslov-share-test\molitvoslov-app:
# powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-phone-webp-20261114.ps1
param([switch]$InstallOnPhone, [switch]$Universal)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Assert-Success([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed: exit code $LASTEXITCODE" }
}
function Python([string[]]$arguments) {
  & py -3 @arguments
  Assert-Success ('Python: ' + ($arguments -join ' '))
}

Push-Location $root
try {
  $branch = (& git branch --show-current).Trim()
  Assert-Success 'git branch'
  if ($branch -ne 'build/android-phone-webp-20261114') {
    throw "Wrong branch ($branch). Use the isolated build/android-phone-webp-20261114 branch."
  }
  $cfg = Get-Content '.\app.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = $cfg.expo.version
  $code = [int]$cfg.expo.android.versionCode
  if ($code -ne 32 -or $version -ne '1.0.31') {
    throw "Unexpected release version $version ($code). Expected 1.0.31 (32)."
  }
  if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Python launcher missing. Install Python with py -3 or run in an environment where py is available.'
  }
  if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  }
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  $env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = 'offline'
  Write-Host "Building Molitvoslov $version ($code), branch $branch" -ForegroundColor Cyan

  Write-Host '[1/6] Verify Git LFS and full-size offline search DB' -ForegroundColor Cyan
  Push-Location (Split-Path -Parent $root)
  try {
    & git lfs pull
    Assert-Success 'git lfs pull'
  } finally {
    Pop-Location
  }
  $db = Join-Path $root 'src\data\search_seed.db'
  if (-not (Test-Path $db) -or (Get-Item $db).Length -lt 10MB) {
    throw 'search_seed.db is missing or is a Git LFS pointer. DO NOT build an incomplete APK.'
  }

  Write-Host '[2/6] Verify and prepare 17 lossless WebP photos' -ForegroundColor Cyan
  & py -3 -c 'from PIL import Image,features; assert features.check("webp")'
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Pillow with WebP support is required. Try: py -3 -m pip install Pillow' -ForegroundColor Yellow
    throw 'Pillow/WebP preflight failed'
  }
  Python @('.\tools\test_webp_lossless_20261113.py')
  Python @('.\tools\prepare_webp_lossless_20261113.py','--apply')
  Python @('.\tools\prepare_webp_lossless_20261113.py','--check')
  Python @('.\tools\verify_phone_webp_assets_20261114.py')

  Write-Host '[3/6] Verify reader fixes, sharing and offline bundle' -ForegroundColor Cyan
  & node '.\tools\test_reader_theme_gradient_sync_20261114.js'
  Assert-Success 'Reader regression test'
  & node '.\tools\test_private_book_share_recipient_20261114.js'
  Assert-Success 'Private sharing regression test'
  Python @('.\tools\prepare_offline_apk.py','--verify-only')

  if (-not (Test-Path '.\node_modules')) {
    & npm.cmd ci --ignore-scripts
    Assert-Success 'npm ci'
    & npx.cmd patch-package
    Assert-Success 'patch-package'
  }

  Write-Host '[4/6] Produce native ARM64 release APK without installing it yet' -ForegroundColor Cyan
  $buildArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    '.\tools\build-release-and-smoke-20261113.ps1')
  if (-not $Universal) { $buildArguments += '-Arm64Only' }
  & powershell.exe @buildArguments
  Assert-Success 'Native release build'

  $apk = Join-Path $root "reports\molitvoslov-$version-$code.apk"
  if (-not (Test-Path $apk)) { throw "APK not produced: $apk" }

  Write-Host '[5/6] Inspect real Metro export and compiled APK for all 17 WebPs' -ForegroundColor Cyan
  Python @('.\tools\verify_phone_webp_assets_20261114.py',
    '--export-dir','.\reports\release-js-smoke',
    '--apk',$apk)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\tools\analyze-apk-size-20261113.ps1' -ApkPath $apk
  Assert-Success 'APK size audit'

  Write-Host '[6/6] Ready for phone test' -ForegroundColor Green
  Write-Host "APK: $apk"
  Get-FileHash -Algorithm SHA256 -Path $apk | Format-List
  if ($InstallOnPhone) {
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
      throw 'adb is not available; the APK was built, but not installed.'
    }
    $devices = @(& adb devices | Where-Object { $_ -match '\sdevice$' })
    if ($devices.Count -ne 1) {
      throw 'Connect exactly one authorized Android device. APK is ready but not installed.'
    }
    & adb install -r $apk
    Assert-Success 'adb install -r; do NOT uninstall the old app or delete its data'
    Write-Host 'Installed on the phone. Check the theme and sharing features.' -ForegroundColor Green
  } else {
    Write-Host "To install without deleting user data: adb install -r `"$apk`""
    Write-Host 'If Android reports a signature mismatch, do NOT uninstall the previous app.'
  }
} finally {
  Pop-Location
}
