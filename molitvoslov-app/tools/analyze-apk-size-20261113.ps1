param(
  [string]$ApkPath = "",
  [string]$PreviousApk = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $ApkPath) {
  $cfg = Get-Content (Join-Path $root "app.json") -Encoding UTF8 -Raw | ConvertFrom-Json
  $ApkPath = Join-Path $root ("reports\molitvoslov-{0}-{1}.apk" -f $cfg.expo.version, $cfg.expo.android.versionCode)
}
if (-not (Test-Path -LiteralPath $ApkPath)) {
  throw "APK not found: $ApkPath"
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function AsMiB([double]$bytes) {
  return [Math]::Round($bytes / 1MB, 2)
}
function Category([string]$name) {
  if ($name -match '\.(?:so)$') {return "Native libraries (.so)"}
  if ($name -match '(?:^|/)index\.android\.bundle$|\.hbc$') {return "Android JS/Hermes bundle"}
  if ($name -match '\.(?:db|sqlite|sqlite3)$') {return "SQLite databases"}
  if ($name -match '\.(?:png|jpg|jpeg|webp|gif|avif)$') {return "Images"}
  if ($name -match '\.(?:ttf|otf|woff|woff2)$') {return "Fonts"}
  if ($name -match '\.(?:json|xml|arsc)$') {return "Metadata/resources"}
  if ($name -match '\.(?:dex)$') {return "DEX bytecode"}
  return "Other APK contents"
}
function Inspect([string]$path) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $path).Path)
  try {
    $rows = @($zip.Entries | Where-Object { $_.Name } | ForEach-Object {
      [pscustomobject]@{
        File = $_.FullName
        Category = Category $_.FullName
        CompressedBytes = [double]$_.CompressedLength
        OriginalBytes = [double]$_.Length
      }
    })
    $summary = @($rows | Group-Object Category | ForEach-Object {
      [pscustomobject]@{
        Category = $_.Name
        CompressedMiB = AsMiB (($_.Group | Measure-Object CompressedBytes -Sum).Sum)
        OriginalMiB = AsMiB (($_.Group | Measure-Object OriginalBytes -Sum).Sum)
      }
    } | Sort-Object CompressedMiB -Descending)
    return [pscustomobject]@{
      Path = (Resolve-Path $path).Path
      Bytes = (Get-Item -LiteralPath $path).Length
      Count = $rows.Count
      Rows = $rows
      Summary = $summary
    }
  } finally {
    $zip.Dispose()
  }
}
$current = Inspect $ApkPath
Write-Host ""
Write-Host ("APK: " + $current.Path) -ForegroundColor Cyan
Write-Host ("File size on disk: " + (AsMiB $current.Bytes) + " MiB")
Write-Host ("ZIP entries: " + $current.Count)
Write-Host ""
Write-Host "Categories by size stored in APK:" -ForegroundColor Cyan
$current.Summary | Format-Table -AutoSize
Write-Host ""
Write-Host "Largest 25 files INSIDE APK (not source repository):" -ForegroundColor Cyan
$current.Rows | Sort-Object CompressedBytes -Descending | Select-Object -First 25 |
  ForEach-Object {
    [pscustomobject]@{
      MiB = AsMiB $_.CompressedBytes
      RawMiB = AsMiB $_.OriginalBytes
      File = $_.File
    }
  } | Format-Table -AutoSize
if ($PreviousApk) {
  if (-not (Test-Path -LiteralPath $PreviousApk)) {
    throw "Previous APK not found: $PreviousApk"
  }
  $previous = Inspect $PreviousApk
  Write-Host ""
  Write-Host ("Previous APK: " + $previous.Path) -ForegroundColor Cyan
  Write-Host ("Previous size: " + (AsMiB $previous.Bytes) + " MiB")
  Write-Host ("New minus old: " + (AsMiB ($current.Bytes - $previous.Bytes)) + " MiB")
  $categories = @($current.Summary.Category + $previous.Summary.Category | Sort-Object -Unique)
  $comparison = foreach ($cat in $categories) {
    $now = @($current.Rows | Where-Object {$_.Category -eq $cat} | Measure-Object CompressedBytes -Sum)
    $before = @($previous.Rows | Where-Object {$_.Category -eq $cat} | Measure-Object CompressedBytes -Sum)
    $newBytes = [double]$now[0].Sum
    $oldBytes = [double]$before[0].Sum
    [pscustomobject]@{
      Category = $cat
      OldMiB = AsMiB $oldBytes
      NewMiB = AsMiB $newBytes
      DeltaMiB = AsMiB ($newBytes - $oldBytes)
    }
  }
  $comparison | Sort-Object DeltaMiB -Descending | Format-Table -AutoSize
}
