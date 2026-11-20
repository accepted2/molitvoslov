# Third Hour display aligned to First Hour.
# Windows PowerShell 5.1-safe (ASCII), with no resets or wholesale restores.
# The only modified project files are the Third Hour presentation JSON
# and the shared CSS (scoped strictly to Third Hour). Both get backups.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Assert-Pass([string]$step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step failed with exit code $LASTEXITCODE; check the output above."
  }
}

Write-Host '[1/5] Dry-run: compare current Third Hour with the First Hour template'
node .\tools\apply_hours_third_match_first_20261120.js --dry-run
Assert-Pass 'Third Hour preflight'

Write-Host '[2/5] Apply editorial layout with automatic backups'
node .\tools\apply_hours_third_match_first_20261120.js
Assert-Pass 'Third Hour layout'

Write-Host '[3/5] Test exact Third Hour text/layout flags'
node .\tools\test_hours_third_match_first_20261120.js
Assert-Pass 'Third Hour presentation test'

Write-Host '[4/5] Run prior Third Hour content and renderer regression'
node .\tools\test_hours_third_hour.js
Assert-Pass 'Existing Third Hour test'

Write-Host '[5/5] Run shared First Hour/Third Hour typography regression'
node .\tools\test_hours_typography.js
Assert-Pass 'Shared Hours typography'

Write-Host 'PASS: Third Hour is ready for emulator visual verification.'
Write-Host 'Text, Psalms, translations, selection offsets, and other Hours remain unchanged.'
