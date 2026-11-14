# Repair duplicate .png/.webp Android resources from the PREVIOUS Metro
# output without touching any source images, native project or the JS bundle.
#
# Dry run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\repair-generated-drawable-twins-20261114.ps1
# Repair and resume APK without running Metro again:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\repair-generated-drawable-twins-20261114.ps1 -Apply -ResumeBuild
#
param([switch]$Apply, [switch]$ResumeBuild)
$ErrorActionPreference = 'Stop'
if ($ResumeBuild -and -not $Apply) { throw '-ResumeBuild requires -Apply.' }
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$drawable = Join-Path $root 'android\app\build\generated\res\react\release\drawable-mdpi'
$bundle = Join-Path $root 'android\app\build\generated\assets\react\release\index.android.bundle'
$reports = Join-Path $root 'reports'
if (-not (Test-Path -LiteralPath $drawable)) {
  throw "Metro release drawable output does not exist: $drawable"
}
if (-not (Test-Path -LiteralPath $bundle)) {
  throw "Successful Metro release bundle missing: $bundle. Do not resume Gradle with -x."
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'android\gradlew.bat'))) {
  throw 'The original Android Gradle wrapper does not exist.'
}
$config = Get-Content -LiteralPath (Join-Path $root 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.expo.version -ne '1.0.30' -or [int]$config.expo.android.versionCode -ne 31) {
  throw "Expected release 1.0.30 (31), found $($config.expo.version) ($($config.expo.android.versionCode))."
}
$home = @('akathists','canons','communion','evening','hero','morning','page_bg2','page_bg3','psalter')
$evangelists = @('john-bg','john-icon','luke-bg','luke-icon','mark-bg','mark-icon','matthew-bg','matthew-icon')
$images = @(
  @($home | ForEach-Object {
    [pscustomobject]@{
      Source = ('assets\home\' + $_ + '.webp')
      CodeFile = 'src\data\homeArtwork.js'
      Id = ('assets_home_' + $_)
      ImageName = $_
    }
  })
  @($evangelists | ForEach-Object {
    [pscustomobject]@{
      Source = ('assets\bible\evangelists\' + $_ + '.webp')
      CodeFile = 'src\data\bibleArtwork.js'
      Id = ('assets_bible_evangelists_' + ($_ -replace '[^a-z0-9]', ''))
      ImageName = $_
    }
  })
)
$dupes = New-Object 'System.Collections.Generic.List[object]'
foreach ($item in $images) {
  $webpSource = Join-Path $root $item.Source
  if (-not (Test-Path -LiteralPath $webpSource)) {
    throw "Original WebP missing: $webpSource. Refusing to repair generated files."
  }
  $codePath = Join-Path $root $item.CodeFile
  $code = Get-Content -LiteralPath $codePath -Raw -Encoding UTF8
  if (-not $code.Contains($item.ImageName + '.webp')) {
    throw ("Source code does not reference " + $item.ImageName +
      ".webp in " + $item.CodeFile +
      ". This may be a real PNG/WebP import collision, not an old cache. Aborting.")
  }
  $png = Join-Path $drawable ($item.Id + '.png')
  $webp = Join-Path $drawable ($item.Id + '.webp')
  if ((Test-Path -LiteralPath $png) -and (Test-Path -LiteralPath $webp)) {
    $pngInfo = Get-Item -LiteralPath $png
    $webpInfo = Get-Item -LiteralPath $webp
    $dupes.Add([pscustomobject]@{
      Png = $png
      Webp = $webp
      PngTime = $pngInfo.LastWriteTime
      WebpTime = $webpInfo.LastWriteTime
      PngBytes = $pngInfo.Length
      WebpBytes = $webpInfo.Length
    })
  } elseif (Test-Path -LiteralPath $png) {
    Write-Warning ("Found PNG without generated WebP: " + $item.Id + ".png; leaving it untouched.")
  }
}
Write-Host ('Release JS bundle: ' + $bundle) -ForegroundColor Cyan
Write-Host ('Bundle modified: ' + (Get-Item -LiteralPath $bundle).LastWriteTime)
Write-Host ('Generated PNG/WebP name collisions: ' + $dupes.Count) -ForegroundColor Cyan
$dupes | Select-Object @{n='Resource';e={Split-Path -Leaf $_.Png}},PngTime,WebpTime,PngBytes,WebpBytes |
  Format-Table -AutoSize | Out-String | Write-Host
if (-not $Apply) {
  Write-Host 'DRY RUN: no files deleted, no build launched.' -ForegroundColor Green
  Write-Host 'If all resources and times are expected, rerun with -Apply -ResumeBuild.'
  exit 0
}
New-Item -ItemType Directory -Path $reports -Force | Out-Null
$backups = Join-Path $reports ('generated-png-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if ($dupes.Count) {
  New-Item -ItemType Directory -Path $backups -Force | Out-Null
  foreach ($file in $dupes) {
    Copy-Item -LiteralPath $file.Png -Destination (Join-Path $backups (Split-Path -Leaf $file.Png)) -Force
  }
  foreach ($file in $dupes) {
    Remove-Item -LiteralPath $file.Png -Force -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $file.Webp)) {
      throw ("WebP vanished during repair: " + $file.Webp)
    }
  }
  Write-Host ('Removed only ' + $dupes.Count + ' duplicate generated PNG files.') -ForegroundColor Green
  Write-Host ('Backup of generated PNGs: ' + $backups) -ForegroundColor Cyan
}
if (-not $ResumeBuild) {
  Write-Host 'Repair complete. Native sources, original artwork and bundle unchanged.'
  exit 0
}
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = 'offline'
Write-Host 'Resuming Android release with the already-generated JS bundle (no Metro rerun)...' -ForegroundColor Cyan
Push-Location (Join-Path $root 'android')
try {
  & .\gradlew.bat ':app:assembleRelease' '--no-daemon' '-PreactNativeArchitectures=arm64-v8a' '-x' ':app:createBundleReleaseJsAndAssets'
  $gradleCode = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($gradleCode -ne 0) { throw "Gradle assembleRelease failed (exit code $gradleCode)." }
$apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw "APK not found: $apk" }
$output = Join-Path $reports 'molitvoslov-1.0.30-31.apk'
Copy-Item -LiteralPath $apk -Destination $output -Force
Write-Host ('APK: ' + $output) -ForegroundColor Green
Get-FileHash -LiteralPath $output -Algorithm SHA256 | Format-List
