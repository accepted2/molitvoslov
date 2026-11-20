# Targeted Akathist UI/content patch. ASCII-only for Windows PowerShell 5.1.
# Reads existing local project, backs up only 3 source modules.
# No git reset, no clean, no full offline export, no APK.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Check-Exit([string]$step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step failed (exit code $LASTEXITCODE)"
  }
}
Write-Host '[1/4] Inspect current Akathist reader and supplement (dry run)'
node .\tools\apply_akathist_prose_kontakion1_trinity_20261120.js --dry-run
Check-Exit 'Reader preflight'
Write-Host '[2/4] Apply prose/Kontakion1/Trinity patch with backups'
node .\tools\apply_akathist_prose_kontakion1_trinity_20261120.js
Check-Exit 'Reader patch'
Write-Host '[3/4] Test actual WebView helpers and prayer text'
node .\tools\test_akathist_prose_kontakion1_trinity_20261120.js
Check-Exit 'Regression tests'
Write-Host '[4/4] Audit real bundled Akathists for two first-Kontakion examples'
node .\tools\audit_akathist_prayer_kontakion1_20261120.js
Check-Exit 'Full bundled Akathist audit'
Write-Host 'PASS: ready for emulator visual check.'
Write-Host 'Report: reports\akathist-prayer-and-first-kontakion-audit-20261120.json'
Write-Host 'Original offlineContent.json, search data and saved user data were not touched.'
