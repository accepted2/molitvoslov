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
  throw "APK not found: $ApkPath"
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
  throw "apksigner.bat not found in Android SDK build-tools."
}

$output=@(& $apksigner verify --print-certs $ApkPath 2>&1)
if($LASTEXITCODE -ne 0) {
  throw "APK signature verification failed: $($output -join ' ')"
}
$details=$output -join "`n"
$match=[regex]::Match($details,
  '(?im)Signer\s*#?1\s*certificate SHA-256 digest:\s*([0-9a-fA-F]{64})')
if(-not $match.Success){
  throw "Unable to find SHA-256 of the APK signing certificate. apksigner output: $details"
}
$sha=$match.Groups[1].Value.ToUpperInvariant()
$pairs=@(for($i=0;$i -lt 64;$i+=2){$sha.Substring($i,2)})
$fingerprint=$pairs -join ':'
Write-Host "`nAPK signing certificate SHA-256:" -ForegroundColor Cyan
Write-Host $fingerprint -ForegroundColor Green
Write-Host "`nRender > Environment > add/update:"
Write-Host "ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=$fingerprint" -ForegroundColor Yellow
Write-Host "For Google Play releases, also add Play App Signing SHA-256 if it differs from the APK certificate."

if($CheckServer){
  $url='https://molitvoslov-3o9d.onrender.com/.well-known/assetlinks.json'
  try{
    $response=Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20
    $serverCerts=@($response[0].target.sha256_cert_fingerprints)
    if($serverCerts -contains $fingerprint){
      Write-Host "OK: Render assetlinks.json includes this APK signing certificate." -ForegroundColor Green
    }else{
      Write-Host "WARNING: Render does not list this APK certificate yet; Android App Links cannot verify." -ForegroundColor Yellow
    }
  }catch{
    Write-Host "Server check unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
