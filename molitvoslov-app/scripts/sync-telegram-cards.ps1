# Run from the Molitvoslov checkout after the corrected 2025-2027 month
# JSON files have been exported. Never publishes to Telegram or deploys Render.
param(
    [string]$BotWorktree = "C:\m\svetilnik-uk-audit",
    [string]$UocDb = "C:\m\svetilnik-uk-package\uoc_calendar_2025_2027.sqlite3",
    [string]$BaseRef = "HEAD",
    [switch]$Apply,
    [switch]$UploadToPrivateRelease,
    [switch]$AllowMassUpdate,
    [switch]$AllowClears
)
$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$botScript = Join-Path $BotWorktree "tools\sync_molitvoslov_cards.ps1"
if (-not (Test-Path -LiteralPath $botScript -PathType Leaf)) {
    throw "Sync implementation not found in bot test worktree: $botScript"
}
$arguments = @("-AppRepo", $appRoot, "-Source", $UocDb, "-BaseRef", $BaseRef)
if ($Apply) { $arguments += "-Apply" }
if ($UploadToPrivateRelease) { $arguments += "-UploadToPrivateRelease" }
if ($AllowMassUpdate) { $arguments += "-AllowMassUpdate" }
if ($AllowClears) { $arguments += "-AllowClears" }
& $botScript @arguments
if (-not $?) { throw "Molitvoslov-to-Telegram synchronization failed." }
