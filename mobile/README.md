# Android APK — клон веб-сервиса Литком М52

Capacitor-оболочка: в APK лежит тонкий bootstrap, который читает актуальный URL сервиса и открывает его 1-в-1.

## Как это работает для пользователя

1. Ставит APK.
2. Приложение берёт адрес из конфига:
   - `https://arnolder.ru/litcom-app-config.json`
   - fallback: `https://litkom-m52.arnolder.ru/app-config.json`
3. Открывает живой веб-сервис (витрина).

Переезд домена = правка JSON, без новой сборки APK для пользователей.

## Обновление APK из приложения

На сплэше (до ухода на сайт) сравнивается локальный `versionCode` с полями конфига:

```json
{
  "apkVersionCode": 2,
  "apkVersionName": "1.1.0",
  "apkUrl": "https://arnolder.ru/litcom52.apk"
}
```

Если remote > local — экран «Доступно обновление» → «Обновить» открывает загрузку APK, «Позже» пускает на витрину.

Выкладка новой версии:

```bash
# поднять versionCode / versionName в android/app/build.gradle
bash mobile/publish-apk.sh
```

Скрипт собирает APK, кладёт на `arnolder.ru/litcom52.apk` и обновляет `litcom-app-config.json`.

## Админка (хитрый вход + сессия + пуш)

Отдельного APK нет. На сплэше: **7 быстрых тапов** по зелёной букве «Л» → поле токена (`ADMIN_TOKEN`) → «Войти в админку».  
Уже с первого тапа уход на витрину стопается (счётчик `N/7`); если серию не добить за ~2.5 с — снова открывается витрина.

После успешного входа:
- токен пишется в **Capacitor Preferences** — следующий запуск APK сразу открывает `/admin` (без 7 тапов);
- после подтверждения токена сервером APK **сам** регистрирует FCM и шлёт подписку на бэк (тумблер не обязателен);
- «Выйти» в админке или «Отмена» на сплэше сбрасывает сессию → снова витрина.

Нужны: задеплоенный фронт + Firebase (`google-services.json` + `FIREBASE_SERVICE_ACCOUNT_PATH`).

## Сборка debug APK

Нужны **JDK 21+** (Capacitor 8) и Android SDK.

Локально у нас уже лежит:

- JDK: `~/.jdks/jdk-21*`
- SDK: `~/.android-sdk` (`android/local.properties` → `sdk.dir`)

```bash
export JAVA_HOME=$(ls -d ~/.jdks/jdk-21* | head -1)
export ANDROID_HOME=~/.android-sdk
export PATH="$JAVA_HOME/bin:$PATH"

npm install
npm run mobile:sync
cd android && ./gradlew assembleDebug
```

Готовый debug APK копируется сюда после сборки: `mobile/artifacts/litcom52-debug.apk`

APK:

`android/app/build/outputs/apk/debug/app-debug.apk`

Открыть проект в Android Studio:

```bash
npm run mobile:open
```

## Release / подпись

В Android Studio: Build → Generate Signed Bundle / APK  
или настроить `android/keystore` + `assembleRelease`.

## Конфиг после переезда

Файл:

```json
{
  "webUrl": "https://НОВЫЙ-ДОМЕН/",
  "apiBase": "https://НОВЫЙ-ДОМЕН",
  "updatedAt": "YYYY-MM-DD"
}
```

Кладётся:

- на litcom: `public/app-config.json` → `/app-config.json`
- стабильный якорь: `https://arnolder.ru/litcom-app-config.json` (`/var/www/html/` на VPS arnolder)

## Push (FCM) в APK

Браузерный Web Push в WebView не работает. В APK — **FCM** через `@capacitor/push-notifications`.

### 1. Firebase Console

1. Создать проект → добавить Android-приложение с package `ru.arnolder.litcom52`
2. Скачать `google-services.json` → положить в `android/app/google-services.json`
3. Project settings → Service accounts → Generate new private key → JSON на сервер  
   (например `/opt/litcom52/secrets/firebase-service-account.json`)

### 2. Сервер (.env на VPS)

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/opt/litcom52/secrets/firebase-service-account.json
```

Перезапуск `litcom52` / `npm start`. Web Push (VAPID) остаётся для браузера/PWA — оба канала шлются вместе.

### 3. В приложении

Админка или витрина → тумблер уведомлений. В APK пойдёт FCM-токен на `/api/.../push/subscribe`.

## App ID

`ru.arnolder.litcom52`
