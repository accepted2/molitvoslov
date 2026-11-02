# Installs reader-specific settings without overwriting other local work.
# Call from app root after restoring this script from GitHub.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch = 'backup/local-changes-20261028'
$python = 'C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "Backend Python environment not found: $python" }

Write-Host '[1/5] Fetch current reader customization sources'
& git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }
$paths = @(
  'src/services/scopedReaderAppearance.js',
  'src/hooks/useScopedReaderAppearance.js',
  'src/components/reader/ReaderAppearanceSheet.js',
  'tools/apply_reader_presentation.py',
  'tools/apply_scoped_reader_screens.py',
  'tools/apply_account_reader_language.py',
  'tools/verify_scoped_reader_settings.js'
)
& git restore --source=FETCH_HEAD -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Cannot restore reader customization files' }

Write-Host '[2/5] Integrate WebView live appearance, gradients, and header labels'
& $python -X utf8 '.\tools\apply_reader_presentation.py'
if ($LASTEXITCODE -ne 0) { throw 'Reader presentation patch stopped; no further patches executed' }

Write-Host '[3/5] Enable per-rule settings and remember last language'
& $python -X utf8 '.\tools\apply_scoped_reader_screens.py'
if ($LASTEXITCODE -ne 0) { throw 'Reader screen patch stopped' }

Write-Host '[4/5] Scope text language preferences to last signed-in account'
& $python -X utf8 '.\tools\apply_account_reader_language.py'
if ($LASTEXITCODE -ne 0) { throw 'Account reader language patch stopped' }

Write-Host '[5/5] Babel syntax/import verification and diff validation'
& node '.\tools\verify_scoped_reader_settings.js'
if ($LASTEXITCODE -ne 0) { throw 'Reader syntax/import verification failed: do not build an APK' }
& git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Git formatting validation failed' }

Write-Host 'READER CUSTOMIZATION PATCH AND SYNTAX VERIFICATION COMPLETE'
Write-Host 'Features: scoped fonts/colors, adaptive gradients, last-used mode and account-local storage.'
Write-Host 'Do not release until verified on an Android device.'
