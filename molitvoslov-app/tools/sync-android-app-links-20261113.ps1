param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$manifest=Join-Path $root 'android\app\src\main\AndroidManifest.xml'
if (-not (Test-Path $manifest)) {
  throw "AndroidManifest.xml not found: $manifest. Run expo prebuild first."
}

$hostName='molitvoslov-3o9d.onrender.com'
$text=[IO.File]::ReadAllText($manifest)
$expected='android:host="'+$hostName+'"'
if ($text.Contains($expected)) {
  if ($text -notmatch 'android:autoVerify="true"') {
    throw "HTTPS link exists but android:autoVerify is missing. Inspect AndroidManifest.xml."
  }
  Write-Host "OK: AndroidManifest.xml already declares verified HTTPS App Links." -ForegroundColor Green
  exit 0
}
if ($CheckOnly) {
  throw "AndroidManifest.xml has no verified HTTPS App Links intent filter."
}

$pattern='(?s)<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>[\s\S]*?</activity>'
$match=[regex]::Match($text,$pattern)
if (-not $match.Success) {
  throw "MainActivity not found. Manifest was not modified."
}
$close=$match.Value.LastIndexOf('</activity>')
$insertAt=$match.Index+$close
$filter=@'
      <!-- molitvoslov-verified-app-links: direct Telegram HTTPS links -->
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:scheme="https" android:host="molitvoslov-3o9d.onrender.com"
          android:pathPrefix="/api/share/"/>
      </intent-filter>
'@
$updated=$text.Insert($insertAt,$filter+"`r`n    ")
try {
  [xml]$validated=$updated
} catch {
  throw "XML validation failed. AndroidManifest.xml was not modified: $_"
}
$backup=Join-Path $root 'reports\AndroidManifest.before-app-links.xml'
New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
if (-not (Test-Path $backup)) {Copy-Item $manifest $backup}
[IO.File]::WriteAllText($manifest,$updated,(New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: HTTPS autoVerify added to existing AndroidManifest.xml; widgets and Kotlin unchanged." -ForegroundColor Green
