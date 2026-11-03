# Show every published Django akathist and safely refresh the emulator's
# offlineContent.json only when the new export contains more akathists without
# losing any existing prayers or published texts.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$python = 'C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
$branch = 'backup/local-changes-20261028'
if (-not (Test-Path $python)) { throw "Python environment not found: $python" }

Write-Host '[1/4] Fetch safe visibility/export patch and offline-data verifier'
& git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Git fetch failed' }
$files = @(
  'tools/fix_missing_akathists.py',
  'tools/verify_akathist_content.js'
)
& git restore --source=FETCH_HEAD -- $files
if ($LASTEXITCODE -ne 0) { throw 'Cannot restore akathist patch tools' }

Write-Host '[2/4] Remove curated-only filter and compare with local Django export'
& $python -X utf8 '.\tools\fix_missing_akathists.py'
if ($LASTEXITCODE -ne 0) { throw 'Akathist patch/export comparison failed' }

Write-Host '[3/4] Validate published list and complete offline details'
& node '.\tools\verify_akathist_content.js'
if ($LASTEXITCODE -ne 0) { throw 'Akathist offline verification failed' }

Write-Host '[4/4] Check working tree'
& git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Git whitespace validation failed' }
Write-Host 'AKATHIST VISIBILITY AND OFFLINE EXPORT VERIFIED'
Write-Host 'Check the comparison above for newly exported akathists.'
Write-Host 'If the JSON was updated, restart Metro with: npx expo start --dev-client --clear'
