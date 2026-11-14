# Test the CMake/Ninja path-length hypothesis without moving the working tree.
# Maps the existing app to a short virtual drive and tests ONLY NitroGoogleSignin.
# It does not delete user data, APKs, signing keys, or the full Android project.
param([ValidatePattern('^[A-Za-z]$')][string]$DriveLetter = 'R')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$drive = $DriveLetter.ToUpperInvariant() + ':'
$mapped = $drive + '\'
$testTask = ':react-native-nitro-google-signin:buildCMakeRelWithDebInfo[arm64-v8a]'

if (-not (Test-Path (Join-Path $root 'android\gradlew.bat'))) {
  throw 'android/gradlew.bat missing. This short-path probe requires existing native Android project.'
}
$existing = & subst
if ($LASTEXITCODE -ne 0) { throw 'Unable to query SUBST mappings.' }
$prior = @($existing | Where-Object { $_ -match ('^' + [regex]::Escape($drive) + '\\') })
if ($prior.Count) {
  if (-not ($prior | Where-Object { $_ -like "*$root*" })) {
    throw "Drive $drive is mapped to a different directory: $($prior -join '; '). Choose another drive letter."
  }
} elseif (Test-Path ($mapped)) {
  throw "Drive $drive is already in use by Windows. Choose another unused drive letter."
} else {
  & subst $drive $root
  if ($LASTEXITCODE -ne 0) { throw "SUBST failed for $drive -> $root" }
}
Write-Host "Short path: $mapped -> $root" -ForegroundColor Cyan
if (-not (Test-Path ($mapped + 'package.json'))) {
  throw 'Mapped project directory has no package.json; do not build.'
}
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_PRAYER_RULES_SOURCE = 'offline'
$cache = $mapped + 'node_modules\react-native-nitro-google-signin\android\.cxx'
# The diagnostic evidence has already been saved under reports/.
# This one generated cache needs regeneration with paths rooted at R:.
if (Test-Path -LiteralPath $cache) {
  Write-Host 'Clearing only the generated Nitro Google Sign-In .cxx folder...' -ForegroundColor Yellow
  Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction Stop
}
Write-Host "Testing only $testTask" -ForegroundColor Cyan
Push-Location ($mapped + 'android')
try {
  & .\gradlew.bat $testTask '--no-daemon' '-PreactNativeArchitectures=arm64-v8a' '--max-workers=2'
  $code=$LASTEXITCODE
} finally { Pop-Location }
if ($code -ne 0) {
  Write-Warning "The short mapped path did not solve Nitro compilation (exit $code)."
  Write-Host 'This confirms that merely clearing Ninja caches was insufficient.'
  Write-Host 'Next safe option: build a separate real short worktree (e.g. C:\mb), not move/remove this checkout.'
  exit $code
}
Write-Host 'PASS: Nitro Google Sign-In CMake compiled using the short path.' -ForegroundColor Green
Write-Host 'Now test the full APK from the SAME mapped path:' -ForegroundColor Cyan
Write-Host "  cd $mapped"
Write-Host "  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\build-release-and-smoke-20261113.ps1 -Arm64Only"
Write-Host "Mapping is temporary (current Windows session): subst $drive /D removes it after the build."
