# Fast, non-executing syntax preflight for Windows PowerShell 5.1.
# No Gradle, Expo, device, or network access is required.
$ErrorActionPreference = "Stop"
$files = @(
  "build-release-and-smoke-20261113.ps1",
  "sync-android-app-links-20261113.ps1",
  "check-android-app-links-20261113.ps1"
)

foreach ($name in $files) {
  $file = Join-Path $PSScriptRoot $name
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Missing PowerShell file: $file"
  }
  $tokens = $null
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile(
    $file, [ref]$tokens, [ref]$parseErrors
  )
  if ($parseErrors -and $parseErrors.Count -gt 0) {
    foreach ($errorItem in $parseErrors) {
      Write-Host ("ERROR: " + $name + ":" + $errorItem.Extent.StartLineNumber) -ForegroundColor Red
      Write-Host $errorItem.Message -ForegroundColor Red
    }
    throw "PowerShell syntax check failed: $name"
  }
  $source = [IO.File]::ReadAllText($file)
  if ([regex]::IsMatch($source, "[^\x00-\x7F]")) {
    throw "Non-ASCII source characters detected: $name"
  }
  Write-Host ("PASS: " + $name) -ForegroundColor Green
}
Write-Host "PASS: all Android release PowerShell scripts parse in this Windows PowerShell." -ForegroundColor Green
