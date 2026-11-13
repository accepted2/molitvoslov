param(
  [string]$ApkPath="",
  [switch]$CheckServer
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if (-not $ApkPath) {
  $config=Get-Content (Join-Path $root 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $ApkPath=Join-Path $root ("reports\molitvoslov-{0}-{1}.apk" -f
    $config.expo.version,$config.expo.android.versionCode)
}
if (-not (Test-Path $ApkPath)) {
  throw "APK не найден: $ApkPath"
}
$ApkPath=(Resolve-Path $ApkPath).Path

$sdkPaths=@(
  $env:ANDROID_SDK_ROOT,
  $env:ANDROID_HOME,
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'build-tools')) } |
  Select-Object -Unique
$apksigner=$null
foreach ($sdk in $sdkPaths) {
  $tools=Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object Name -Descending
  foreach ($tool in $tools) {
    $candidate=Join-Path $tool.FullName 'apksigner.bat'
    if(Test-Path $candidate){$apksigner=$candidate;break}
  }
  if($apksigner){break}
}
if(-not $apksigner){
  throw "Не найден apksigner.bat в Android SDK build-tools."
}

$output=@(& $apksigner verify --print-certs $ApkPath 2>&1)
if($LASTEXITCODE -ne 0) {
  throw "Подпись APK не прошла проверку: $($output -join ' ')"
}
$details=$output -join "`n"
$match=[regex]::Match($details,
  '(?im)Signer\s*#?1\s*certificate SHA-256 digest:\s*([0-9a-fA-F]{64})')
if(-not $match.Success){
  throw "Не удалось получить SHA-256 сертификата подписи APK. Вывод: $details"
}
$sha=$match.Groups[1].Value.ToUpperInvariant()
$pairs=@(for($i=0;$i -lt 64;$i+=2){$sha.Substring($i,2)})
$fingerprint=$pairs -join ':'
Write-Host "`nSHA-256 сертификата APK:" -ForegroundColor Cyan
Write-Host $fingerprint -ForegroundColor Green
Write-Host "`nRender -> Environment, добавить/обновить:"
Write-Host "ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=$fingerprint" -ForegroundColor Yellow
Write-Host "После публикации в Google Play следует добавить к этой переменной и Play App Signing SHA-256, если он отличается."

if($CheckServer){
  $url='https://molitvoslov-3o9d.onrender.com/.well-known/assetlinks.json'
  try{
    $response=Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20
    $serverCerts=@($response[0].target.sha256_cert_fingerprints)
    if($serverCerts -contains $fingerprint){
      Write-Host "OK: сервер подтвердил текущую подпись APK." -ForegroundColor Green
    }else{
      Write-Host "ВНИМАНИЕ: сервер ещё не содержит SHA-256 этого APK. Прямые App Links не будут проверены." -ForegroundColor Yellow
    }
  }catch{
    Write-Host "Проверка сервера не удалась: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
