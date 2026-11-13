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
# Regression guard: Gradle must run inside android/ rather than the app root.
$builder = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "build-release-and-smoke-20261113.ps1"))
if (-not $builder.Contains('Push-Location $androidDir')) {
  throw "Gradle release must change into the Android project directory."
}
if (-not $builder.Contains('& ".\gradlew.bat" @gradleArgs')) {
  throw "Gradle wrapper call missing from Android project directory."
}
if ($builder.Contains('& ".\android\gradlew.bat" ":app:assembleRelease" "--no-daemon"')) {
  throw "Old Gradle invocation from Expo root is still present."
}
if (-not $builder.Contains('Pop-Location')) {
  throw "Working directory restoration missing."
}
Write-Host "PASS: Gradle wrapper runs from android/ and returns to the app directory." -ForegroundColor Green
if (-not $builder.Contains('[switch]$Arm64Only') -or
    -not $builder.Contains('-PreactNativeArchitectures=arm64-v8a') -or
    -not $builder.Contains('$gradleArgs = @(":app:assembleRelease", "--no-daemon")')) {
  throw "Expected optional ARM64-only Gradle release mode is missing."
}
Write-Host "PASS: ARM64 fallback uses reactNativeArchitectures without changing project files." -ForegroundColor Green

