param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$manifest=Join-Path $root 'android\app\src\main\AndroidManifest.xml'
if (-not (Test-Path $manifest)) {
  throw "AndroidManifest.xml не найден: $manifest. Сначала выполните expo prebuild."
}

$hostName='molitvoslov-3o9d.onrender.com'
$text=[IO.File]::ReadAllText($manifest)
$expected='android:host="'+$hostName+'"'
if ($text.Contains($expected)) {
  if ($text -notmatch 'android:autoVerify="true"') {
    throw "Ссылка уже указана, но autoVerify не подтвержден. Проверьте AndroidManifest.xml."
  }
  Write-Host "OK: HTTPS App Links уже зарегистрированы в AndroidManifest.xml" -ForegroundColor Green
  exit 0
}
if ($CheckOnly) {
  throw "В AndroidManifest.xml отсутствует HTTPS App Links фильтр."
}

$pattern='(?s)<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>[\s\S]*?</activity>'
$match=[regex]::Match($text,$pattern)
if (-not $match.Success) {
  throw "MainActivity не найдена. Файл не изменён."
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
  [xml]$null=$updated
} catch {
  throw "Проверка XML не прошла. AndroidManifest.xml не изменён: $_"
}
$backup=Join-Path $root 'reports\AndroidManifest.before-app-links.xml'
New-Item -ItemType Directory -Force (Split-Path $backup) | Out-Null
if (-not (Test-Path $backup)) {Copy-Item $manifest $backup}
[IO.File]::WriteAllText($manifest,$updated,(New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: в существующий AndroidManifest.xml добавлен HTTPS autoVerify. Виджеты и Kotlin не затронуты." -ForegroundColor Green
