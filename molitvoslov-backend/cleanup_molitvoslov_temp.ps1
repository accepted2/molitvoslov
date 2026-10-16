param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Запусти внутри репозитория Git' }
$backend = Join-Path $repo 'molitvoslov-backend'
if (!(Test-Path $backend)) { throw "Не найдена папка $backend" }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$archive = Join-Path (Split-Path $repo -Parent) ("molitvoslov_cleanup_backup_" + $stamp)
$report = @()
$generated = @(
  'reports', 'april_dryrun.txt','february_dryrun.txt','february_dryrun_fixed.txt',
  'march_dryrun.txt','march_dryrun_fixed.txt', 'calendar_four_gaps_report_2026.txt',
  'calendar_readings_audit_2027.csv','calendar_readings_source_check_2027.csv',
  'calendar_year_audit.json','calendar_preview_2027.json',
  'complete_calendar_gaps_2026.py.backup',
  'finish_calendar_nov_dec_2026.py.backup','finish_calendar_nov_dec_2026.py.backup2'
)
$candidates = @(
 'apply_neutral_hymns_2026.py','audit_august_details.py','audit_azbyka_feasts_2026.py',
 'audit_calendar_card_storage.py','audit_four_calendar_gaps_2026 (1).py',
 'audit_four_calendar_gaps_2026.py','audit_january_april_2026.py','audit_remaining_2026.py',
 'check_august_encoding.py','check_cloudinary_config.py','check_september_dryrun.py',
 'cleanup_august_2026.py','cleanup_calendar_orphans.py','cleanup_june_2026.py',
 'cleanup_may_2026.py','complete_calendar_gaps_2026.py','fill_pascha_nicholas_2026.py',
 'final_calendar_audit_2026.py','find_august_missing.py','find_evmeniy_source.py',
 'find_final_calendar_gaps.py','finish_icons_and_audit_texts_2026.py',
 'fix_april_main.py','fix_august_fasting_2026.py','fix_calendar_gaps_check.py',
 'fix_calendar_say.py','fix_july_2026.py','fix_june_main_2026.py','fix_may_22.py',
 'inspect_cloudinary_setup.py','inspect_evmeniy_source.py','inspect_feodosiy_life.py',
 'neutral_final_calendar_2026.py','neutralize_all_calendar_texts.py',
 'recover_september_2026.py','restore_august_icon.py','restore_feodosiy_life.py',
 'run_august_apply.py','run_september_apply.py','run_september_dryrun.py',
 'set_pascha_icon_2026.py','show_august_log.py','verify_august.py',
 'verify_september_october.py','restore_september_icons_and_evmeniy.py',
 'audit_2027_readings.py','install_readings_guard.py','verify_2027_readings.py',
 'build_calendar_from_json.py','generate_molitvoslov_year.py',
 'README_permanent_calendar.txt','README_RU.md',
 'api/management/commands/generate_calendar_year (1).py',
 'api/management/commands/audit_2027_readings.py',
 'api/management/commands/verify_2027_readings.py',
 'api/management/commands/install_readings_guard.py',
 'api/management/commands/export_calendar_reference_2026.py',
 'api/management/commands/generate_calendar_v2.py',
 'api/management/commands/generate_calendar_year_safe.py',
 'api/management/commands/generate_calendar_years_v3.py',
 'api/management/commands/generate_calendar_years_v4.py',
 'api/management/commands/relink_calendar_v2.py',
 'api/test_calendar_engine_v2.py','api/test_calendar_engine_v3.py','api/test_calendar_engine_v4.py',
 'api/calendar_engine_v2.py','api/calendar_engine_v3.py','api/calendar_engine_v4.py'
)
# Core assets and existing 2027 import explicitly preserved: main catalog, generated calendar,
# import_calendar_feasts_2027, generate_calendar_year, fasting importer and UI changes.
# This tool never deletes: it moves into a backup folder outside the repository.
$srcFiles = @(Get-ChildItem $repo -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '[\\/](\.git|node_modules|\.expo|venv|\.venv|__pycache__|backups|reports)[\\/]' -and
  $_.Extension -in @('.py','.js','.jsx','.ts','.tsx','.json','.yml','.yaml','.sh','.ps1','.md') -and
  $_.Length -lt 2MB
})
$allCandidates = @($generated | ForEach-Object { [pscustomobject]@{Path=$_;Generated=$true} }) + @($candidates | ForEach-Object { [pscustomobject]@{Path=$_;Generated=$false} })
foreach ($entry in $allCandidates) {
  $rel = $entry.Path.Replace('/','\')
  $src = Join-Path $backend $rel
  if (!(Test-Path -LiteralPath $src)) { continue }
  $stem = [IO.Path]::GetFileNameWithoutExtension($src)
  $basename = [IO.Path]::GetFileName($src)
  $referencedBy = @()
  if (!$entry.Generated) {
    foreach ($f in $srcFiles) {
      if ($f.Name -eq 'cleanup_molitvoslov_temp.ps1') { continue }
      if ($f.FullName -eq $src) { continue }
      if ($f.FullName -like "$backend\reports\*") { continue }
      # Check Python/JS imports, script execution by name and command invocation.
      $data = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
      if ($null -ne $data -and ($data.Contains($stem) -or $data.Contains($basename))) {
        $relativeRef = $f.FullName.Substring($repo.Length+1)
        # References from files that are themselves being archived aren't considered active.
        $insideBackend = $relativeRef.StartsWith('molitvoslov-backend\')
        $relativeBackend = if ($insideBackend) { $relativeRef.Substring('molitvoslov-backend\'.Length).Replace('\','/') } else { $relativeRef }
        if (($allCandidates.Path -notcontains $relativeBackend) -and ($generated -notcontains $relativeBackend)) { $referencedBy += $relativeRef }
      }
    }
  }
  $status = if ($referencedBy.Count -gt 0) { 'KEEP_REFERENCED' } else { 'ARCHIVE' }
  $report += [pscustomobject]@{ File=$entry.Path; Decision=$status; ReferencedBy=($referencedBy -join '; ') }
  if ($Apply -and $status -eq 'ARCHIVE') {
    $destination = Join-Path $archive (Join-Path 'molitvoslov-backend' $rel)
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    # Unstage before moving. Never touches already-committed files.
    & git -C $repo reset -q HEAD -- ("molitvoslov-backend/" + $entry.Path.Replace('\','/'))
    Move-Item -LiteralPath $src -Destination $destination
  }
}
$csv = Join-Path $repo 'cleanup_preview.csv'
$report | Export-Csv -Path $csv -Encoding UTF8 -NoTypeInformation
Write-Host "Проверено кандидатов: $($report.Count)"
Write-Host "В архив: $(($report | Where-Object Decision -eq 'ARCHIVE').Count); сохранить по ссылкам: $(($report | Where-Object Decision -eq 'KEEP_REFERENCED').Count)"
Write-Host "Отчёт: $csv"
if ($Apply) { Write-Host "Архив перемещённых файлов: $archive" } else { Write-Host 'DRY RUN: ничего не перемещено. Для выполнения укажи -Apply.' }
