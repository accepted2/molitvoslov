# Прямые ссылки «Telegram → Молитвослов» — Android App Links

Версия реализации: APK 1.0.28 (versionCode 29). Публикация в Google Play для этой функции **не требуется**.

## Что происходит

- Получатель нажимает обычную HTTPS-ссылку из Telegram:
  `https://molitvoslov-3o9d.onrender.com/api/share/?path=bible%2F1%2F1%2Frst`.
- Если Android **подтвердил связь домена с подписью установленного APK**, система передаёт ссылку сразу в MainActivity; JavaScript превращает её в внутренний маршрут `molitvoslov://bible/1/1/rst`. Render для открытия текста не загружается.
- Если APK отсутствует либо связь не подтверждена, откроется резервная веб-страница. Она показывает кнопку открытия приложения, а после публикации в Play может также показывать кнопку установки. Telegram иногда использует собственный встроенный браузер, поэтому этот сценарий необходимо отдельно проверить на реальном устройстве.
- Частные помянники/молитвословы используют `?invite=<token>` и открывают `SharedImport` через тот же механизм. Импорт и фотографии по-прежнему требуют server API и входа в аккаунт.

## Требование для прямых ссылок: SHA-256 **сертификата подписи APK**

`/.well-known/assetlinks.json` должен находиться на том же домене без редиректов (HTTP 200, `application/json`). На Render добавить environment variable:

`ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF`

Не угадывать fingerprint. Сборщик автоматически получает его из **реально собранного APK** командой Android SDK `apksigner verify --print-certs`. Отпечаток SHA256 файла APK, который выводится командой `Get-FileHash`, **не подходит**.

Можно перечислить несколько сертификатов через запятую: для локального release APK и, после выхода в Google Play, отдельно сертификат **Play App Signing** (он может отличаться от upload key).

Если переменная отсутствует, endpoint сознательно отвечает HTTP 503 и Android **не** считает сайт подтверждённым.

## Подготовка и сборка (PowerShell)

```powershell
cd C:\m\molitvoslov-search\molitvoslov-app
node .\tools\test_android_app_links_20261113.js
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-release-and-smoke-20261113.ps1 -InstallOnPhone
```

Скрипт в существующей папке `android/` безопасно добавляет intent filter в `android/app/src/main/AndroidManifest.xml`, предварительно сохраняет его копию в `reports/`. Не выполняет `expo prebuild --clean`: это важно для локальных виджетов и Kotlin. APK: `reports/molitvoslov-1.0.28-29.apk`.

После получения fingerprint:
1. Обновить backend Render из этой ветки.
2. В Render Environment добавить fingerprint и запустить redeploy.
3. Открыть `https://molitvoslov-3o9d.onrender.com/.well-known/assetlinks.json`: должен вернуться JSON с `com.accepted2.molitvoslov` и тем же SHA-256.
4. При желании проверить API и backend-тест:
   ```powershell
   cd ..\molitvoslov-backend
   python manage.py test api.test_android_app_links
   ```

## Проверка телефона через ADB

```powershell
adb shell pm verify-app-links --re-verify com.accepted2.molitvoslov
adb shell pm get-app-links com.accepted2.molitvoslov
adb shell am start -W -a android.intent.action.VIEW -d "https://molitvoslov-3o9d.onrender.com/api/share/?path=bible%2F1%2F1%2Frst"
```

В выводе `get-app-links` для домена нужен статус `verified` (или другое системное подтверждение связи). Для `am start` должна запуститься MainActivity, после чего приложение откроет нужную главу. Для приватного приглашения проверьте валидный полученный token на другом тестовом аккаунте.

Проверить Telegram на двух устройствах отдельно: прямое открытие, получение ссылки при уже открытом приложении, запуск из закрытого состояния, несоответствующий перевод, отсутствие APK, нежелательные браузерные промежуточные страницы.

## После выпуска в Google Play

Если приложение ещё не установлено, Google Play сам по себе не будет открываться по обычной ссылке в обход сайта. Разместите валидный адрес страницы приложения в переменной Render:
`MOLITVOSLOV_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.accepted2.molitvoslov`

Тогда резервная страница покажет кнопку установки. Добавьте SHA-256 **App signing key certificate** из Play Console к `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS`. Новая сборка приложения для этого обычно не нужна.

При смене домена с Render на собственный следует обновить host в `app.json`, `appLinks.js`, `contentSharing.js` и AndroidManifest, а также развернуть `assetlinks.json` на новом домене.
