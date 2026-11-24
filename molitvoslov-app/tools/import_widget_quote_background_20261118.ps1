# Imports ONLY the optimized JPEG from the user's original widgets archive.
# No app.json modifications. The app keeps the same Android widget providers.
param(
  [Parameter(Mandatory=$true)]
  [string]$ZipPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'src\widgets\QuoteOfDayWidget.js'
$target = Join-Path $root 'assets\widgets\quote-bg.jpg'
if (-not (Test-Path -LiteralPath $source)) {
  throw "QuoteOfDayWidget.js not found: $source"
}
$old = "require('../../assets/home/hero.png')"
$new = "require('../../assets/widgets/quote-bg.jpg')"
$text = [System.IO.File]::ReadAllText($source)
$oldCount = ([regex]::Matches($text, [regex]::Escape($old))).Count
$newCount = ([regex]::Matches($text, [regex]::Escape($new))).Count
if ($newCount -eq 1 -and $oldCount -eq 0 -and (Test-Path -LiteralPath $target)) {
  Write-Host 'PASS: optimized widget background already imported.'
  exit 0
}
if ($oldCount -ne 1 -or $newCount -ne 0) {
  throw 'Unexpected quote background reference; no files modified.'
}
$fullZip = (Resolve-Path -LiteralPath $ZipPath -ErrorAction Stop).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($fullZip)
try {
  $entry = $zip.GetEntry('molitvoslov-app/assets/widgets/quote-bg.jpg')
  if ($null -eq $entry -or $entry.Length -lt 2000 -or $entry.Length -gt 400000) {
    throw 'Missing or unexpected quote-bg.jpg in archive. No files modified.'
  }
  $memory = [System.IO.MemoryStream]::new()
  try {
    $stream = $entry.Open()
    try { $stream.CopyTo($memory) } finally { $stream.Dispose() }
    $bytes = $memory.ToArray()
  } finally { $memory.Dispose() }
  if ($bytes.Length -lt 3 -or $bytes[0] -ne 255 -or $bytes[1] -ne 216 -or $bytes[2] -ne 255) {
    throw 'Background file is not a valid JPEG. No files modified.'
  }
} finally { $zip.Dispose() }

$backups = Join-Path (Split-Path -Parent $root) (
  'build-backups\widgets-background-before-' +
  [DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss_fff')
)
New-Item -ItemType Directory -Force -Path $backups | Out-Null
Copy-Item -LiteralPath $source -Destination (Join-Path $backups 'QuoteOfDayWidget.js')
$oldImage = Test-Path -LiteralPath $target
if ($oldImage) { Copy-Item -LiteralPath $target -Destination (Join-Path $backups 'quote-bg.jpg') }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
try {
  [System.IO.File]::WriteAllBytes($target, $bytes)
  [System.IO.File]::WriteAllText($source, $text.Replace($old, $new),
    [System.Text.UTF8Encoding]::new($false))
} catch {
  Copy-Item -LiteralPath (Join-Path $backups 'QuoteOfDayWidget.js') -Destination $source -Force
  if ($oldImage) {
    Copy-Item -LiteralPath (Join-Path $backups 'quote-bg.jpg') -Destination $target -Force
  } elseif (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force
  }
  throw
}
Write-Host 'PASS: optimized 960x640 JPEG background imported (without changing splash screen).'
Write-Host "Backup: $backups"
Write-Host 'The JPEG now needs to be included in your next Git commit to persist in GitHub.'
