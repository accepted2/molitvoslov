# Apply current phone-test UI code to the proven local Android workspace.
# Never checkout/switch/reset either repository; never modify the working
# Android native project, node_modules, backend, local hours content or WebPs.
# Run from C:\m\molitvoslov-share-test\molitvoslov-app:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\overlay-latest-on-working-android-20261114.ps1
param(
  [string]$Target = "C:\m\molitvoslov-search\molitvoslov-app",
  [switch]$Apply
)
$ErrorActionPreference = "Stop"
$source=(Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetPath=(Resolve-Path -LiteralPath $Target -ErrorAction Stop).Path
if ([string]::Equals($source,$targetPath,[StringComparison]::OrdinalIgnoreCase)) {
  throw "Source and target are the same checkout: do not overlay."
}
$sourceBranch=(& git -C (Split-Path -Parent $source) branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceBranch -ne "fix/hours-local-first-and-dropdown-20261114") {
  throw "Wrong source branch ($sourceBranch); fetch and switch the share-test checkout first."
}
if (-not (Test-Path (Join-Path $targetPath "android\gradlew.bat"))) {
  throw "Target is not the previously working Android project: $targetPath"
}
$oldJson=Join-Path $targetPath "src\data\hoursTexts.json"
if (-not (Test-Path $oldJson)) { throw "Original hoursTexts.json is missing: abort." }
$hours=Get-Content -LiteralPath $oldJson -Raw -Encoding UTF8 | ConvertFrom-Json
# Windows PowerShell 5.1 does not reliably provide a Count member on
# PSObject.Properties. Materialize the names into a proper array first.
$hoursEntryNames=@($hours.entries.PSObject.Properties | ForEach-Object { $_.Name })
Write-Host ("Original local Hours services: " + $hoursEntryNames.Count) -ForegroundColor Cyan
if ($hoursEntryNames.Count -lt 20 -or
    -not ($hoursEntryNames -contains "ordinary-1")) {
  throw ("Original full Hours library is missing or incomplete. Found " +
    $hoursEntryNames.Count + " services; First Hour present=" +
    ($hoursEntryNames -contains "ordinary-1") + ". Expected at least 20 with ordinary-1.")
}
$photoNames=@("akathists","canons","communion","evening","hero","morning","page_bg2","page_bg3","psalter")
$evangelists=@("john-bg","john-icon","luke-bg","luke-icon","mark-bg","mark-icon","matthew-bg","matthew-icon")
$photoPaths=@($photoNames | ForEach-Object { Join-Path $targetPath ("assets\home\"+$_+".webp") }) +
  @($evangelists | ForEach-Object { Join-Path $targetPath ("assets\bible\evangelists\"+$_+".webp") })
$missingPhotos=@($photoPaths | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missingPhotos.Count) {
  throw "Expected 17 original optimized WebPs in the working project. Missing: $($missingPhotos -join ', ')"
}
$protected=@(
  "src\data\hoursTexts.json",
  "src\data\hoursFirstHourTraditional.json",
  "src\data\search_seed.db",
  "src\data\homeArtwork.js",
  "src\data\bibleArtwork.js"
)
$targetVersion=Get-Content -LiteralPath (Join-Path $targetPath "app.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$sourceVersion=Get-Content -LiteralPath (Join-Path $source "app.json") -Raw -Encoding UTF8 | ConvertFrom-Json
# Native packages stay installed as yesterday; don't combine new JS with
# incompatible React Native / Expo / Google Sign-In dependency versions.
$oldPackages=Get-Content -LiteralPath (Join-Path $targetPath "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$newPackages=Get-Content -LiteralPath (Join-Path $source "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($name in @("react-native","expo","react-native-nitro-google-signin","react-native-nitro-modules")) {
  $oldVersion=$oldPackages.dependencies.PSObject.Properties[$name].Value
  $newVersion=$newPackages.dependencies.PSObject.Properties[$name].Value
  if ($oldVersion -ne $newVersion) {
    throw ("Native dependency mismatch for " + $name + ": working=" + $oldVersion + ", latest=" + $newVersion)
  }
}
if ($sourceVersion.expo.version -ne "1.0.30" -or
    [int]$sourceVersion.expo.android.versionCode -ne 31) {
  throw "Unexpected source version: $($sourceVersion.expo.version) ($($sourceVersion.expo.android.versionCode))"
}
if ($targetVersion.expo.version -ne "1.0.29" -or
    [int]$targetVersion.expo.android.versionCode -ne 30) {
  Write-Warning "Target app version differs from the known 1.0.29 (30); verify expected checkout."
}
$oldApk=Join-Path $targetPath "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $oldApk)) {
  throw "The proven previous APK does not exist: $oldApk"
}

# Only the app source and release tooling. Never overwrite the original working
# npm/Gradle dependency tree, signing files, .env, Android, report artifacts or
# backend. Preserve custom photo references and local hour editions above.
$roots=@("src","assets","tools","scripts","patches")
$rootFiles=@("App.js","app.json","index.js","babel.config.js","metro.config.js")
$all=New-Object "System.Collections.Generic.List[object]"
foreach($rootName in $roots){
  $dir=Join-Path $source $rootName
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Recurse -File | ForEach-Object {
    $rel=$_.FullName.Substring($source.Length+1)
    $normalized=$rel.Replace("/","\")
    if ($normalized -match '(^|\\)(?:__pycache__|\.expo|reports|\.gradle)(?:\\|$)' -or
        $normalized -match '\.(?:bak|pyc)$' -or
        $normalized -match '\.bak[-.]' -or
        $protected -contains $normalized) { return }
    $all.Add([pscustomobject]@{Relative=$rel;Source=$_.FullName;Destination=(Join-Path $targetPath $rel)})
  }
}
foreach($rel in $rootFiles){
  $p=Join-Path $source $rel
  if (Test-Path -LiteralPath $p) {
    $all.Add([pscustomobject]@{Relative=$rel;Source=$p;Destination=(Join-Path $targetPath $rel)})
  }
}
# Use lengths and file hashes to avoid replacing identical files. The backup
# includes BOTH modified tracked and untracked target files before overlay.
$changes=New-Object "System.Collections.Generic.List[object]"
foreach($file in $all){
  $different=$true
  if (Test-Path -LiteralPath $file.Destination) {
    $old=(Get-Item -LiteralPath $file.Destination).Length
    $new=(Get-Item -LiteralPath $file.Source).Length
    if ($old -eq $new) {
      $different=((Get-FileHash -Algorithm SHA256 -LiteralPath $file.Source).Hash -ne
                  (Get-FileHash -Algorithm SHA256 -LiteralPath $file.Destination).Hash)
    }
  }
  if ($different){$changes.Add($file)}
}
Write-Host "Source branch: $sourceBranch" -ForegroundColor Cyan
Write-Host "Working Android: $targetPath" -ForegroundColor Cyan
Write-Host "Files to update/add: $($changes.Count) / $($all.Count)"
Write-Host "PRESERVED: android/, node_modules/, backend/, package*.json," -ForegroundColor Yellow
Write-Host "  local hoursTexts.json, hoursFirstHourTraditional.json, search_seed.db," -ForegroundColor Yellow
Write-Host "  homeArtwork.js and bibleArtwork.js (17 optimized WebPs remain)." -ForegroundColor Yellow
if (-not $Apply) {
  $changes | Select-Object -First 50 Relative | Format-Table -AutoSize
  Write-Host "DRY RUN ONLY: no files changed." -ForegroundColor Green
  Write-Host "To apply with per-file backup, run the same command with -Apply."
  exit 0
}
$backupDir=Join-Path (Split-Path -Parent $targetPath) ("overlay-backup-20261114-"+(Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$manifest=New-Object "System.Collections.Generic.List[object]"
foreach($file in $changes){
  $existed=Test-Path -LiteralPath $file.Destination
  if($existed){
    $backupFile=Join-Path $backupDir $file.Relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $backupFile) -Force | Out-Null
    Copy-Item -LiteralPath $file.Destination -Destination $backupFile -Force
  }
  $manifest.Add([pscustomobject]@{Relative=$file.Relative;PreviouslyExisted=$existed})
}
$manifestFile=Join-Path $backupDir "overlay-manifest.csv"
$manifest | Export-Csv -LiteralPath $manifestFile -NoTypeInformation -Encoding UTF8
Write-Host "Backup of all overwritten target files: $backupDir" -ForegroundColor Green
foreach($file in $changes){
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file.Destination) | Out-Null
  Copy-Item -LiteralPath $file.Source -Destination $file.Destination -Force
}
$check=Get-Content -LiteralPath $oldJson -Raw -Encoding UTF8 | ConvertFrom-Json
$checkEntryNames=@($check.entries.PSObject.Properties | ForEach-Object { $_.Name })
if ($checkEntryNames.Count -lt 20 -or
    -not ($checkEntryNames -contains "ordinary-1")) {
  throw "Post-overlay safety check failed: complete Hours library disappeared."
}
if (@($photoPaths | Where-Object { -not (Test-Path -LiteralPath $_) }).Count) {
  throw "Post-overlay safety check failed: one of the 17 optimized WebPs disappeared."
}
if (-not (Test-Path (Join-Path $targetPath "android\gradlew.bat"))) {
  throw "Post-overlay safety check failed: Gradle wrapper missing."
}
Write-Host "OVERLAY PASS: copied $($changes.Count) updated files; original First Hour and native Android preserved." -ForegroundColor Green
Write-Host "Backup manifest: $manifestFile"
Write-Host "Next: cd '$targetPath'; run release tests and build with the existing native Android."
