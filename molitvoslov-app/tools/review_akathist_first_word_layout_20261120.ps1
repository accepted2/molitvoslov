<#
Apply the Akathist first-word and new-line typography to the local
development project. Assumes previous Ikos and prose-guard fixes are installed.
Only the WebView runtime is changed; a timestamped backup is created.
No APK build, no JSON rewrite, no user-data clear.
ASCII-only for Windows PowerShell 5.1.
#>
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Check-Exit([string]$step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step FAILED (exit code $LASTEXITCODE). See errors above."
  }
}

Write-Host '[1/4] Check existing reader and new Akathist accents (no changes)'
node .\tools\apply_akathist_first_word_layout_20261120.js --dry-run
Check-Exit 'Akathist first-word dry run'

Write-Host '[2/4] Install first-word-only red accents and one-line-per-response'
node .\tools\apply_akathist_first_word_layout_20261120.js
Check-Exit 'Akathist first-word patch'

Write-Host '[3/4] Test Ikos, Kontakion 1, Jesus Sweetest, and special formulas'
node .\tools\test_akathist_first_word_layout_20261120.js
Check-Exit 'Akathist first-word tests'

Write-Host '[4/4] Audit every locally bundled Akathist and language block'
node .\tools\audit_akathist_first_word_layout_20261120.js
Check-Exit 'Akathist full corpus audit'

Write-Host 'PASS: Akathist reader typography updated locally.'
Write-Host 'Review any ambiguous cases in reports\akathist-first-word-layout-audit-20261120.json'
Write-Host 'No APK built; original prayer texts and user data unchanged.'
