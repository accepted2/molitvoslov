# Third Hour: remove duplicate dividers and split Chtec "Amin / Slava".
# Safe for Windows PowerShell 5.1. Existing local reader source is backed up.
# No git reset/clean, no text import, no APK build, no user-data clear.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
function Assert-Exit([string]$stage) {
  if ($LASTEXITCODE -ne 0) {
    throw "$stage failed. See the error above. No further commands will run."
  }
}

Write-Host '[1/6] Check current Third Hour and reader without modifying files'
node .\tools\apply_hours_third_dividers_amen_20261120.js --dry-run
Assert-Exit 'Third Hour divider preflight'

Write-Host '[2/6] Apply targeted fix (backup of four affected files)'
node .\tools\apply_hours_third_dividers_amen_20261120.js
Assert-Exit 'Third Hour divider fix'

Write-Host '[3/6] Verify screenshot-specific reader content, rules, red cues and IDs'
node .\tools\test_hours_third_dividers_amen_20261120.js
Assert-Exit 'Third Hour screenshot regression'

Write-Host '[4/6] Verify existing Third Hour text and formatting'
node .\tools\test_hours_third_hour.js
Assert-Exit 'Third Hour existing regression'

Write-Host '[5/6] Verify earlier First Hour-style improvements'
node .\tools\test_hours_third_match_first_20261120.js
Assert-Exit 'Third Hour presentation regression'

Write-Host '[6/6] Verify shared First Hour/Third Hour typography'
node .\tools\test_hours_typography.js
Assert-Exit 'Shared Hours typography regression'

Write-Host 'PASS: Third Hour ready for emulator visual inspection.'
Write-Host 'Original prayer/psalm text, saved row IDs and other Hours unchanged.'
