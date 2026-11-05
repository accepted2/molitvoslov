# Apply only GitHub-reviewed reader/calendar fixes, not offline content or the DB.
# Windows PowerShell 5.1/7. Must be invoked from molitvoslov-app.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$branch = 'backup/local-changes-20261028'
$files = @(
  'src/services/personalPrayerPresentation.js',
  'src/services/prayerSearch.js',
  'src/services/prayerBooks.js',
  'src/services/personalPrayerReadingDocument.js',
  'src/screens/PrayerBookScreen.js',
  'src/screens/PersonalPrayerEditorScreen.js',
  'src/screens/PrayerBookReaderScreen.js',
  'src/components/reader/PersonalPrayerReadingView.js',
  'src/components/reader/CalendarSaveText.js',
  'src/components/reader/SelectableDocumentReader.js',
  'src/components/reader/selectableDocumentReader/runtime.js',
  'src/components/reader/selectableDocumentReader/styles.js',
  'src/context/TextSelectionContext.js',
  'src/screens/SaintDetailScreen.js',
  'src/screens/ChurchCalendarScreen.js',
  'tools/verify_prayer_book_calendar_integrity_20261105.js',
  'tools/verify_restored_reader_features_20261104.js',
  'tools/verify_reader_typography_and_personal_prayers_20261104.js',
  'tools/verify_personal_prayer_edit_20261105.js'
)
function Assert-Last([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}
Write-Host '[1/4] Fetch GitHub branch (no merge, no offlineContent.json overwrite)'
& git fetch origin $branch
Assert-Last 'Git fetch'

Write-Host '[2/4] Back up all existing files that will be replaced'
$backupRoot = Join-Path (Split-Path -Parent $root) (
  'build-backups\prayer-reader-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
foreach ($rel in $files) {
  if (-not (Test-Path -LiteralPath $rel)) { continue }
  $dst = Join-Path $backupRoot $rel
  New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
  Copy-Item -LiteralPath $rel -Destination $dst -Force
}
Write-Host "Source backup: $backupRoot"

Write-Host '[3/4] Restore only the selected code/test files'
& git restore --source=FETCH_HEAD -- $files
Assert-Last 'Selective Git restore'
# The generated/public content is precious and must remain untouched.
& git diff --check -- $files
Assert-Last 'Git whitespace verification'

Write-Host '[4/4] Test imports, titles, languages, typography and save selections'
$tests = @(
  'tools/verify_prayer_book_calendar_integrity_20261105.js',
  'tools/verify_restored_reader_features_20261104.js',
  'tools/verify_reader_typography_and_personal_prayers_20261104.js',
  'tools/verify_personal_prayer_edit_20261105.js',
  'tools/verify_psalter_heading_colors_20261104.js
  'tools/verify_reader_customization_20261104.js',
  'tools/verify_react_hook_imports.js'
)
foreach ($test in $tests) {
  & node $test
  Assert-Last $test
}
Write-Host 'READER FIXES VERIFIED. Offline JSON, search DB and personal SQLite are unchanged.'
Write-Host 'Restart Metro: npx expo start --dev-client (no forced cache clear)'
