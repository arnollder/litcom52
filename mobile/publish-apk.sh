#!/usr/bin/env bash
# Собрать debug APK, выложить на arnolder.ru и обновить litcom-app-config.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${PUBLISH_HOST:-root@88.218.171.254}"
REMOTE_APK="${REMOTE_APK:-/var/www/html/litcom52.apk}"
REMOTE_CFG="${REMOTE_CFG:-/var/www/html/litcom-app-config.json}"

export JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/.jdks/jdk-21* 2>/dev/null | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="${JAVA_HOME}/bin:${PATH}"

cd "$ROOT"
VERSION_CODE="$(grep -E 'versionCode\s+' android/app/build.gradle | head -1 | grep -oE '[0-9]+')"
VERSION_NAME="$(grep -E 'versionName\s+' android/app/build.gradle | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"

echo "Building APK ${VERSION_NAME} (${VERSION_CODE})…"
npm run mobile:sync
(cd android && ./gradlew assembleDebug --no-daemon)
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
mkdir -p "$ROOT/mobile/artifacts"
cp -f "$APK" "$ROOT/mobile/artifacts/litcom52-debug.apk"

CFG_TMP="$(mktemp)"
cat >"$CFG_TMP" <<EOF
{
  "webUrl": "https://litkom-m52.arnolder.ru/",
  "apiBase": "https://litkom-m52.arnolder.ru",
  "apkVersionCode": ${VERSION_CODE},
  "apkVersionName": "${VERSION_NAME}",
  "apkUrl": "https://arnolder.ru/litcom52.apk",
  "updatedAt": "$(date -u +%Y-%m-%d)"
}
EOF
cp -f "$CFG_TMP" "$ROOT/mobile/litcom-app-config.json"
cp -f "$CFG_TMP" "$ROOT/public/app-config.json"

echo "Uploading to ${HOST}…"
scp -o StrictHostKeyChecking=accept-new "$APK" "${HOST}:${REMOTE_APK}"
scp -o StrictHostKeyChecking=accept-new "$CFG_TMP" "${HOST}:${REMOTE_CFG}"
ssh -o StrictHostKeyChecking=accept-new "$HOST" "chmod 644 '${REMOTE_APK}' '${REMOTE_CFG}'"
rm -f "$CFG_TMP"

echo "OK → https://arnolder.ru/litcom52.apk"
echo "OK → https://arnolder.ru/litcom-app-config.json"
curl -sS -o /dev/null -w "apk %{http_code}\n" "https://arnolder.ru/litcom52.apk"
curl -sS "https://arnolder.ru/litcom-app-config.json"; echo
