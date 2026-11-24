# Fix Android's 17 PNG/WebP resource name collisions at their SOURCE.
# Keeps original PNG and WebP files. Creates uniquely named WebP aliases,
# rewrites only the two artwork registries, and invalidates generated Metro
# release resources (which will be regenerated on the next full Gradle build).
# No Git checkout/switch, npm ci, expo prebuild or native clean.
#
# Dry-run: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fix-artwork-resource-names-20261116.ps1
# Apply:   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\fix-artwork-resource-names-20261116.ps1 -Apply
param([switch]$Apply)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest=Join-Path $root 'android\app\build\generated\res\react\release\drawable-mdpi'
$generated=Join-Path $root 'android\app\build\generated\res\react\release'
$reportRoot=Join-Path $root 'reports'
$groups=@(
  [pscustomobject]@{Folder='assets\home'; Registry='src\data\homeArtwork.js'; Prefix='assets_home_';
    Names=@('akathists','canons','communion','evening','hero','morning','page_bg2','page_bg3','psalter')},
  [pscustomobject]@{Folder='assets\bible\evangelists'; Registry='src\data\bibleArtwork.js'; Prefix='assets_bible_evangelists_';
    Names=@('john-bg','john-icon','luke-bg','luke-icon','mark-bg','mark-icon','matthew-bg','matthew-icon')}
)
if (-not (Test-Path -LiteralPath (Join-Path $root 'android\gradlew.bat'))) { throw 'Original Android native project not found.' }
$ver=Get-Content -LiteralPath (Join-Path $root 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($ver.expo.version -ne '1.0.30' -or [int]$ver.expo.android.versionCode -ne 31) { throw 'This repair is for 1.0.30 (31) only.' }
$registryFiles=@{}
$replacements=New-Object 'System.Collections.Generic.List[object]'
foreach($group in $groups){
  $registry=Join-Path $root $group.Registry
  if (-not (Test-Path -LiteralPath $registry)) { throw "Artwork registry missing: $registry" }
  $body=Get-Content -LiteralPath $registry -Raw -Encoding UTF8
  foreach($name in $group.Names){
    $original=Join-Path $root ($group.Folder + '\' + $name + '.webp')
    if (-not (Test-Path -LiteralPath $original)) { throw "Original optimized WebP missing: $original" }
    $alias=Join-Path $root ($group.Folder + '\' + $name + '_opt.webp')
    $oldRef=$name+'.webp'
    $newRef=$name+'_opt.webp'
    if ($body.Contains($newRef)) {
      throw "Artwork registry already refers to $newRef. Abort to avoid repeated modifications."
    }
    $count=$body.Split([string[]]@($oldRef),[StringSplitOptions]::None).Length-1
    if ($count -ne 1) { throw "Expected exactly one WebP import for $oldRef in $registry; found $count." }
    if (Test-Path -LiteralPath $alias) { throw "Alias already exists: $alias. Refusing to overwrite." }
    $resourceBase=$name -replace '[^a-zA-Z0-9_]', ''
    $oldPng=Join-Path $manifest ($group.Prefix+$resourceBase+'.png')
    $oldWebp=Join-Path $manifest ($group.Prefix+$resourceBase+'.webp')
    if (-not ((Test-Path -LiteralPath $oldPng) -and (Test-Path -LiteralPath $oldWebp))) {
      throw "Expected both generated PNG and WebP for $name. Collision output changed; inspect before repair."
    }
    $body=$body.Replace($oldRef,$newRef)
    $replacements.Add([pscustomobject]@{Registry=$registry;Original=$original;Alias=$alias;OldName=$oldRef;NewName=$newRef})
  }
  $registryFiles[$registry]=$body
}
if ($replacements.Count -ne 17) { throw "Expected 17 replacements, found $($replacements.Count)." }
# Catch other direct source references that could generate old WebP resource IDs.
$sourceFiles=@(Get-ChildItem -LiteralPath (Join-Path $root 'src') -Recurse -File |
  Where-Object { $_.Extension -in @('.js','.jsx','.ts','.tsx') })
$others=New-Object 'System.Collections.Generic.List[string]'
foreach($path in $sourceFiles){
  if($registryFiles.ContainsKey($path.FullName)){continue}
  $body=[IO.File]::ReadAllText($path.FullName)
  foreach($change in $replacements){
    if($body.Contains($change.OldName)){$others.Add($path.FullName+' -> '+$change.OldName)}
  }
}
if ($others.Count) {
  $others | Select-Object -First 30 | ForEach-Object { Write-Warning $_ }
  throw "Other source files refer to one of the 17 original WebP paths. Repair those imports first."
}
Write-Host "Android working project: $root" -ForegroundColor Cyan
Write-Host "Collision pairs confirmed: $($replacements.Count)" -ForegroundColor Cyan
Write-Host "Registry files to update: $($registryFiles.Count)"
Write-Host "Original PNG/WebP files to keep: all 34 and all source assets" -ForegroundColor Green
$replacements | ForEach-Object { Write-Host ('  '+$_.OldName+' -> '+$_.NewName) }
if (-not $Apply) { Write-Host 'DRY RUN ONLY: no files changed.' -ForegroundColor Green; exit 0 }
# Backup registry code and inventory before modifying any source.
$backup=Join-Path $reportRoot ('artwork-collision-source-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach($registry in $registryFiles.Keys){
  Copy-Item -LiteralPath $registry -Destination (Join-Path $backup (Split-Path -Leaf $registry)) -Force
}
$replacements | Select-Object OldName,NewName,Original,Alias | Export-Csv -LiteralPath (Join-Path $backup 'aliases.csv') -NoTypeInformation -Encoding UTF8
# Copy WebP bytes under distinct basenames (never remove or edit originals).
foreach($change in $replacements) { Copy-Item -LiteralPath $change.Original -Destination $change.Alias -ErrorAction Stop }
foreach($registry in $registryFiles.Keys){
  [IO.File]::WriteAllText($registry,$registryFiles[$registry],(New-Object System.Text.UTF8Encoding($false)))
}
# Generated Metro output is not user content. This directory is deliberately
# restricted to the Android app's generated RELEASE resources.
$expected=Join-Path $root 'android\app\build\generated\res\react\release'
if ([string]::Equals($generated,$expected,[StringComparison]::OrdinalIgnoreCase) -and
    (Test-Path -LiteralPath $generated)) {
  Remove-Item -LiteralPath $generated -Recurse -Force -ErrorAction Stop
  Write-Host "Removed only obsolete generated Metro RELEASE resources; the next Gradle build will regenerate them."
}
Write-Host ('PASS: safely differentiated all 17 optimized WebP names. Backup: '+$backup) -ForegroundColor Green
Write-Host "NEXT: run the ordinary full release builder from this working Android project (do NOT skip the Metro bundle task)."
