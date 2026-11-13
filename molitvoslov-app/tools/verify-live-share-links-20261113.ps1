param(
    [string]$BaseUrl = "https://molitvoslov-3o9d.onrender.com",
    [string]$ApkPath = "",
    [switch]$TestOnPhone
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
$packageName = "com.accepted2.molitvoslov"
$publicPath = "bible/1/1/rst"
$shareUrl = "$BaseUrl/api/share/?path=$([Uri]::EscapeDataString($publicPath))"
$assetUrl = "$BaseUrl/.well-known/assetlinks.json"
$privateUrl = "$BaseUrl/api/shared/create/"

function Check-Url([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0
        return [PSCustomObject]@{
            Status = [int]$response.StatusCode
            Body = [string]$response.Content
            Redirect = [string]$response.Headers.Location
        }
    } catch {
        $response = $_.Exception.Response
        if ($null -eq $response) {
            Write-Host "Сбой сети: $($_.Exception.Message)" -ForegroundColor Yellow
            return [PSCustomObject]@{Status=0;Body='';Redirect=''}
        }
        $status = [int]$response.StatusCode
        return [PSCustomObject]@{Status=$status;Body='';Redirect=[string]$response.Headers['Location']}
    }
}

Write-Host ""
Write-Host "1. Проверка ссылки на публичный текст: $shareUrl" -ForegroundColor Cyan
$public = Check-Url $shareUrl
Write-Host "HTTP $($public.Status)"
if ($public.Status -eq 200 -and $public.Body.Contains("molitvoslov://bible/1/1/rst")) {
    Write-Host "OK: маршрут опубликован и содержит переход в приложение" -ForegroundColor Green
} elseif ($public.Status -eq 404) {
    Write-Host "ОШИБКА 404: Render не обслуживает новый маршрут. Проверьте Deployment в Render: должен использовать main с коммитом 3d7b5cab или новее." -ForegroundColor Red
} elseif ($public.Status -eq 0) {
    Write-Host "Не удалось соединиться с Render. Проверьте правильность домена и интернет." -ForegroundColor Yellow
} else {
    Write-Host "Маршрут ещё не подтверждён. Получен HTTP $($public.Status)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2. Проверка Android Digital Asset Links: $assetUrl" -ForegroundColor Cyan
$asset = Check-Url $assetUrl
Write-Host "HTTP $($asset.Status)"
if ($asset.Status -eq 200) {
    try {
        $relations = @((Invoke-RestMethod -Uri $assetUrl -Method Get -TimeoutSec 30))
        $matching = @($relations | Where-Object {
            $_.target.package_name -eq $packageName -and
            $_.relation -contains "delegate_permission/common.handle_all_urls"
        })
        if ($matching.Count -eq 0) {
            Write-Host "ОШИБКА: файл доступен, но не подтверждает пакет $packageName" -ForegroundColor Red
        } else {
            Write-Host "OK: сервер объявляет связь Android с этим пакетом" -ForegroundColor Green
            foreach ($row in $matching) {
                @($row.target.sha256_cert_fingerprints) | ForEach-Object {
                    Write-Host "Сертификат на сервере: $_"
                }
            }
        }
    } catch {
        Write-Host "Не удалось разобрать assetlinks.json: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} elseif ($asset.Status -eq 503) {
    Write-Host "Серверный маршрут существует, но в Render не задан SHA-256 сертификата: ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS." -ForegroundColor Yellow
} elseif ($asset.Status -eq 404) {
    Write-Host "ОШИБКА 404: серверная версия с /.well-known/assetlinks.json не опубликована." -ForegroundColor Red
} else {
    Write-Host "Не удалось подтвердить Digital Asset Links (HTTP $($asset.Status))." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "3. Личные приглашения (молитвослов/помянник): $privateUrl" -ForegroundColor Cyan
$private = Check-Url $privateUrl
Write-Host "HTTP $($private.Status)"
if ($private.Status -eq 404) {
    Write-Host "Внимание: сервер не содержит API личных приглашений. Их публикация требует отдельной миграции и проверки БД." -ForegroundColor Yellow
} elseif ($private.Status -in @(401,403,405)) {
    Write-Host "Маршрут распознан. Для реальной передачи требуется вход владельца и получателя." -ForegroundColor Green
} else {
    Write-Host "Для подтверждения передачи личных материалов нужна отдельная проверка (HTTP $($private.Status))."
}

if ($ApkPath) {
    Write-Host ""
    Write-Host "4. Проверка сертификата подписанного APK" -ForegroundColor Cyan
    $checker = Join-Path $PSScriptRoot 'check-android-app-links-20261113.ps1'
    if (-not (Test-Path $checker)) { throw "Не найден скрипт проверки APK: $checker" }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checker -ApkPath $ApkPath -CheckServer
    if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить сертификат APK." }
}

if ($TestOnPhone) {
    Write-Host ""
    Write-Host "5. Проверка на подключённом Android-телефоне" -ForegroundColor Cyan
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
        throw "ADB недоступен. Установите Android SDK platform-tools."
    }
    & adb shell pm verify-app-links --re-verify $packageName
    & adb shell pm get-app-links $packageName
    Write-Host "У домена должен появиться статус verified. Затем проверяем открытие приложения..." -ForegroundColor Cyan
    & adb shell am start -W -a android.intent.action.VIEW -d $shareUrl
}

Write-Host ""
Write-Host "Проверка завершена. Для прямого открытия нужны: HTTP 200 у публичной ссылки, HTTP 200 у assetlinks.json, соответствующий сертификат APK и verified на устройстве." -ForegroundColor Cyan
