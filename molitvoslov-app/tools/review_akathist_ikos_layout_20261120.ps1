<#
Safely apply and inspect Ikos/Kontakion response typography across all
bundled Akathists. Does not modify source prayers, Russian translations,
favorites, reading positions, the backend, or any installed APK.
Run from molitvoslov-app root:
  & .\tools\review_akathist_ikos_layout_20261120.ps1
ASCII-only file for Windows PowerShell 5.1 compatibility.
#>
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Check-Exit([string]$label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label FAILED with code $LASTEXITCODE. Previous files were preserved."
  }
}

Write-Host '[1/4] Check patch against current reader without changing code'
node .\tools\apply_akathist_ikos_layout_20261120.js --dry-run
Check-Exit 'Akathist typography preflight'

Write-Host '[2/4] Apply reader-only Ikos typography with automatic backup'
node .\tools\apply_akathist_ikos_layout_20261120.js
Check-Exit 'Akathist typography patch'

Write-Host '[3/4] Test the actual WebView response rules and offsets'
node .\tools\test_akathist_ikos_layout_20261120.js
Check-Exit 'Akathist typography unit tests'

Write-Host '[4/4] Audit all bundled Akathists, their Ikoses and Kontakion 1'
node .\tools\audit_akathist_ikos_layout_20261120.js
Check-Exit 'Full Akathist corpus audit'

Write-Host 'PASS: Akathist typography review completed.'
Write-Host 'See reports\akathist-ikos-typography-audit-20261120.json for possible source exceptions.'
Write-Host 'NOTE: No APK was built and no source prayer data was edited.'
