# Enable full offline APK public content with versioned search DB.
# Safe for a working tree with unrelated local modifications.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Assert-Last([string]$name) {
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit code $LASTEXITCODE)" }
}

$branch = 'backup/local-changes-20261028'
$python = 'C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "Backend Python venv missing: $python" }

Write-Host '[1/5] Fetch APK-only patchers, content guard and original source recovery'
& git fetch origin $branch
Assert-Last 'Git fetch'
# Preserve any local edits to the v10 generator before updating the tool.
$searchBuilder = '.\tools\build_search_seed_v10.py'
if (Test-Path $searchBuilder) {
  $backups = Join-Path (Split-Path $root -Parent) 'build-backups'
  New-Item -ItemType Directory -Force -Path $backups | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
  $builderBackup = Join-Path $backups "search-v10-builder-before-ast-$stamp.py"
  Copy-Item -LiteralPath $searchBuilder -Destination $builderBackup -ErrorAction Stop
  Write-Host "Search generator backup: $builderBackup"
}
$files = @(
  'tools/patch_bundled_apk_mode.py',
  'tools/test_apk_patcher_variants.py',
  'tools/verify_bundled_apk_mode.js',
  'tools/prepare_offline_apk.py',
  'tools/build_search_seed_v10.py',
  'tools/test_search_seed_v10_corpus.py',
  'tools/audit_local_public_sources.py',
  'tools/repair_local_mobile_export.py',
  'tools/promote_local_django_offline.py',
  'tools/test_local_offline_export.py',
  'tools/verify_akathist_content.js'
)
& git restore --source=FETCH_HEAD -- $files
Assert-Last 'Restoring installer tools'

# Never overwrite a previously generated search DB manifest.
if (-not (Test-Path '.\src\data\searchSeedBuild.json')) {
  & git restore --source=FETCH_HEAD -- 'src/data/searchSeedBuild.json'
  Assert-Last 'Restoring initial manifest'
}

Write-Host '[2/5] Test customized SearchScreen variants, then safely patch public APK sources'
& $python -X utf8 '.\tools\test_apk_patcher_variants.py'
Assert-Last 'SQLiteProvider filename patch regression tests'
& $python -X utf8 '.\tools\patch_bundled_apk_mode.py'
Assert-Last 'Guarded source patch'
& node '.\tools\verify_bundled_apk_mode.js'
Assert-Last 'APK mode structural verification'

Write-Host '[3/5] Verify exporter logic, audit local sources and promote ALL published public texts'
& $python -X utf8 '.\tools\test_local_offline_export.py'
Assert-Last 'Django exporter and no-loss offline promotion regression tests'
& $python -X utf8 '.\tools\audit_local_public_sources.py'
Assert-Last 'Read-only local content inventory'
& $python -X utf8 '.\tools\repair_local_mobile_export.py'
Assert-Last 'Local Django published akathist export repair'
& $python -X utf8 '.\tools\promote_local_django_offline.py'
Assert-Last 'Complete local Django-to-APK public content promotion'

Write-Host '[4/5] Test complete search extraction, then rebuild SQLite from the exact offline JSON'
& $python -X utf8 '.\tools\test_search_seed_v10_corpus.py'
Assert-Last 'Complete v9-to-v10 corpus and akathist coverage regression tests'
& $python -X utf8 '.\tools\prepare_offline_apk.py'
Assert-Last 'Public content and search seed preflight'
& $python -X utf8 '.\tools\prepare_offline_apk.py' --verify-only
Assert-Last 'Offline payload verification'

Write-Host '[5/5] Final static validation and git formatting'
& node '.\tools\verify_bundled_apk_mode.js'
Assert-Last 'Bundled source verification'
& git diff --check
Assert-Last 'Git formatting'
Write-Host 'APK-OFFLINE PUBLIC CONTENT AND VERSIONED SEARCH VERIFIED'
Write-Host 'No APK built or installed. The emulator may reload content after restarting Metro with --clear.'
Write-Host 'Never uninstall an existing phone APK: personal SQLite data belongs to the user.'
