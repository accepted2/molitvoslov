param(
    [string]$BaseUrl = "https://molitvoslov-3o9d.onrender.com",
    [string]$ApkPath = "",
    [switch]$TestOnPhone
)

# ASCII-only source so Windows PowerShell 5.1 does not misread UTF-8 without BOM.
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$packageName = "com.accepted2.molitvoslov"
$publicPath = "bible/1/1/rst"
$shareUrl = "$BaseUrl/api/share/?path=$([Uri]::EscapeDataString($publicPath))"
$assetUrl = "$BaseUrl/.well-known/assetlinks.json"
$privateUrl = "$BaseUrl/api/shared/create/"

function Check-Url {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 35 -MaximumRedirection 0
        return [PSCustomObject]@{
            Status = [int]$response.StatusCode
            Body = [string]$response.Content
            Redirect = [string]$response.Headers["Location"]
        }
    }
    catch {
        $response = $_.Exception.Response
        if ($null -eq $response) {
            Write-Host ("Network error: " + $_.Exception.Message) -ForegroundColor Yellow
            return [PSCustomObject]@{Status=0;Body="";Redirect=""}
        }
        return [PSCustomObject]@{
            Status = [int]$response.StatusCode
            Body = ""
            Redirect = [string]$response.Headers["Location"]
        }
    }
}

Write-Host ""
Write-Host "STEP 1: public Bible share URL" -ForegroundColor Cyan
Write-Host $shareUrl
$public = Check-Url -Url $shareUrl
Write-Host ("HTTP " + $public.Status)
if ($public.Status -eq 200) {
    if ($public.Body.Contains("molitvoslov://bible/1/1/rst")) {
        Write-Host "PASS: share landing exists and points to the app." -ForegroundColor Green
    } else {
        Write-Host "WARNING: the response is not the expected share landing." -ForegroundColor Yellow
    }
}
elseif ($public.Status -eq 404) {
    Write-Host "FAIL: Render has not deployed the /api/share/ route. Check its deployed commit." -ForegroundColor Red
}
elseif ($public.Status -eq 0) {
    Write-Host "FAIL: cannot reach Render. Verify internet and service URL." -ForegroundColor Red
}
else {
    Write-Host ("WARNING: unexpected public share status: " + $public.Status) -ForegroundColor Yellow
}

Write-Host ""
Write-Host "STEP 2: Android domain verification" -ForegroundColor Cyan
Write-Host $assetUrl
$asset = Check-Url -Url $assetUrl
Write-Host ("HTTP " + $asset.Status)
if ($asset.Status -eq 200) {
    try {
        $data = @(ConvertFrom-Json -InputObject $asset.Body)
        $matches = @($data | Where-Object {
            $_.target.package_name -eq $packageName -and
            $_.relation -contains "delegate_permission/common.handle_all_urls"
        })
        if ($matches.Count -eq 0) {
            Write-Host "FAIL: assetlinks.json does not reference the expected Android app." -ForegroundColor Red
        }
        else {
            Write-Host "PASS: assetlinks.json references this Android package." -ForegroundColor Green
            foreach ($entry in $matches) {
                foreach ($sha in @($entry.target.sha256_cert_fingerprints)) {
                    Write-Host ("Server signing certificate SHA-256: " + $sha)
                }
            }
        }
    }
    catch {
        Write-Host ("FAIL: invalid assetlinks.json: " + $_.Exception.Message) -ForegroundColor Red
    }
}
elseif ($asset.Status -eq 503) {
    Write-Host "WAIT: the server route exists, but the signing certificate fingerprint is not configured." -ForegroundColor Yellow
    Write-Host "Set ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS in Render, then redeploy."
}
elseif ($asset.Status -eq 404) {
    Write-Host "FAIL: /.well-known/assetlinks.json is missing from the deployed backend." -ForegroundColor Red
}
else {
    Write-Host ("WARNING: domain verification status: " + $asset.Status) -ForegroundColor Yellow
}

Write-Host ""
Write-Host "STEP 3: private prayerbook / memorial invitations" -ForegroundColor Cyan
Write-Host $privateUrl
$private = Check-Url -Url $privateUrl
Write-Host ("HTTP " + $private.Status)
if ($private.Status -eq 404) {
    Write-Host "FAIL: private invitation backend is not deployed." -ForegroundColor Yellow
    Write-Host "This requires additional server models/migration and a separate rollout."
}
elseif ($private.Status -in @(401,403,405)) {
    Write-Host "PASS: invitation route exists (authentication or POST is required)." -ForegroundColor Green
}
else {
    Write-Host ("CHECK: invitation route returned HTTP " + $private.Status)
}

if ($ApkPath -ne "") {
    Write-Host ""
    Write-Host "STEP 4: check APK signing certificate" -ForegroundColor Cyan
    $checker = Join-Path $PSScriptRoot "check-android-app-links-20261113.ps1"
    if (-not (Test-Path $checker)) {
        throw "APK signature checker not found: $checker"
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -ApkPath $ApkPath -CheckServer
    if ($LASTEXITCODE -ne 0) { throw "APK certificate check failed." }
}

if ($TestOnPhone) {
    Write-Host ""
    Write-Host "STEP 5: verify installed Android application" -ForegroundColor Cyan
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
        throw "ADB not found: add Android SDK platform-tools to PATH."
    }
    & adb shell pm verify-app-links --re-verify $packageName
    & adb shell pm get-app-links $packageName
    Write-Host "The domain should show verified. Testing the HTTP share intent..." -ForegroundColor Cyan
    & adb shell am start -W -a android.intent.action.VIEW -d $shareUrl
}

Write-Host ""
Write-Host "Completed. Direct opening needs a deployed share route, HTTP 200 assetlinks, matching APK signing cert, and Android verified status." -ForegroundColor Cyan
