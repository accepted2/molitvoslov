# Install reusable title-only category search, saved-only search, and persistent
# multi-add prayer-book picker WITHOUT overwriting the user's current screens.
# Only new search component and guarded patch scripts are checked out.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$python='C:\m\repo\molitvoslov-backend\venv\Scripts\python.exe'
$branch='backup/local-changes-20261028'
if(-not (Test-Path $python)){throw "Python venv not found: $python"}
Write-Host '[1/4] Fetch reusable search component and guarded source patchers'
& git fetch origin $branch
if($LASTEXITCODE -ne 0){throw 'Git fetch failed'}
$paths=@(
 'src/components/search/LocalSearchField.js',
 'tools/patch_local_catalog_search.py',
 'tools/patch_library_title_search.py',
 'tools/verify_local_catalog_search.js'
)
& git restore --source=FETCH_HEAD -- $paths
if($LASTEXITCODE -ne 0){throw 'Unable to fetch local search components'}

Write-Host '[2/4] Add title filters to actual akathist, canon and misc prayer lists'
& $python -X utf8 '.\tools\patch_library_title_search.py'
if($LASTEXITCODE -ne 0){throw 'Library title search patch did not apply; do not release'}

Write-Host '[3/4] Add title filtering to category pages, saved-only search to Favorites, and persistent prayer picker'
& $python -X utf8 '.\tools\patch_local_catalog_search.py'
if($LASTEXITCODE -ne 0){throw 'Saved/prayer picker patch did not apply; do not release'}

Write-Host '[4/4] Validate JSX, imports, local-only constraints and Git formatting'
& node '.\tools\verify_local_catalog_search.js'
if($LASTEXITCODE -ne 0){throw 'Local search verification failed; do not release'}
& git diff --check
if($LASTEXITCODE -ne 0){throw 'Git whitespace check failed'}
Write-Host 'LOCAL TITLE SEARCH, FAVORITES FILTER AND MULTI-ADD PICKER VERIFIED'
Write-Host 'No APK built. Test search and multiple additions in Android dev client.'
