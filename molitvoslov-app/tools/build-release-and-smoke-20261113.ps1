param(
  [switch]$InstallOnPhone,
  [switch]$SkipTests,
  [switch]$SkipPrebuild
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $config = Get-Content ".\app.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = $config.expo.version
  $versionCode = [int]$config.expo.android.versionCode
  Write-Host "Молитвослов $version ($versionCode)" -ForegroundColor Cyan

  if (-not (Test-Path ".\node_modules")) {
    throw "Не найден node_modules. Выполните npm ci из molitvoslov-app."
  }

  if (-not $SkipTests) {
    $tests = @(
      "test_vertical_actions_calendar_favorites_20261113.js",
      "test_calendar_public_share_20261113.js",
      "test_share_bible_saint_photo_20261113.js",
      "test_shared_content_links_20261113.js",
      "test_dual_share_release_20261113.js",
      "test_bible_lists_actions_20261113.js",
      "test_psalter_context_share_font_20261113.js",
      "test_bible_crossrefs_appearance_bookmarks_20261113.js"
    )
    foreach ($test in $tests) {
      Write-Host "TEST: $test"
      & node ".\tools\$test"
      if ($LASTEXITCODE -ne 0) {
        throw "Проверка завершилась с ошибкой: $test"
      }
    }
  }

  New-Item -ItemType Directory -Force -Path ".\reports" | Out-Null
  Write-Host "Проверяем экспорт Android JavaScript bundle..." -ForegroundColor Cyan
  & npx.cmd expo export --platform android --output-dir ".\reports\release-js-smoke"
  if ($LASTEXITCODE -ne 0) { throw "Expo не смог собрать JS bundle." }

  if (-not (Test-Path ".\android\gradlew.bat")) {
    if ($SkipPrebuild) { throw "Нет android\gradlew.bat и указан -SkipPrebuild." }
    Write-Host "Генерируем Android-проект..." -ForegroundColor Cyan
    & npx.cmd expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw "Ошибка expo prebuild." }
  }

  # Existing native Android directories are not regenerated/cleaned: keep
  # custom widget and Kotlin changes. Synchronize only release version fields.
  $buildGradle=Join-Path $root "android\app\build.gradle"
  if (Test-Path $buildGradle) {
    $nativeConfig=[IO.File]::ReadAllText($buildGradle)
    $updatedConfig=[regex]::Replace($nativeConfig,
      '(?m)^(\s*versionCode\s+)\d+', ('${1}'+[string]$versionCode))
    $updatedConfig=[regex]::Replace($updatedConfig,
      '(?m)^(\s*versionName\s+)"[^"]+"', ('${1}"'+$version+'"'))
    if ($nativeConfig -ne $updatedConfig) {
      [IO.File]::WriteAllText($buildGradle,$updatedConfig,
        (New-Object System.Text.UTF8Encoding($false)))
      Write-Host "Обновлена версия Android Gradle: $version ($versionCode)"
    }
  }

  Write-Host "Собираем release APK..." -ForegroundColor Cyan
  & ".\android\gradlew.bat" ":app:assembleRelease" "--no-daemon"
  if ($LASTEXITCODE -ne 0) { throw "Gradle не смог собрать APK." }

  $apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path $apk)) { throw "APK не найден: $apk" }
  $outputDir=Join-Path $root "reports"
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  $releaseApk=Join-Path $outputDir "molitvoslov-$version-$versionCode.apk"
  Copy-Item $apk $releaseApk -Force
  Write-Host "APK: $releaseApk" -ForegroundColor Green
  Get-FileHash $releaseApk -Algorithm SHA256 | Format-Table -AutoSize

  if ($InstallOnPhone) {
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
      throw "adb отсутствует в PATH. Добавьте Android SDK platform-tools."
    }
    $devices = @(& adb devices)
    $connected = @($devices | Where-Object { $_ -match "^\S+\s+device$" })
    if ($connected.Count -ne 1) {
      throw "Подключите ровно одно Android-устройство с разрешённой USB-отладкой."
    }
    & adb install -r $releaseApk
    if ($LASTEXITCODE -ne 0) {
      throw "Ошибка установки. Не удаляйте установленное приложение: это может стереть локальные данные."
    }
    & adb shell am start -n "com.accepted2.molitvoslov/.MainActivity"
    if ($LASTEXITCODE -ne 0) {
      Write-Host "APK установлен. Запустите приложение вручную." -ForegroundColor Yellow
    }
    Write-Host "Установлено. Проверьте вручную меню, ссылки и избранное." -ForegroundColor Green
  }
} finally {
  Pop-Location
}
