#!/usr/bin/env bash
# One-time (or idempotent) setup for admin.litkom-m52.ru on the VPS.
# Usage on server (from repo or /opt/litcom52):
#   bash deploy/setup-admin-vhost.sh
# Or from laptop:
#   ssh root@62.113.110.31 'bash -s' < deploy/setup-admin-vhost.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_CONF="${ROOT_DIR}/deploy/nginx/admin.litkom-m52.ru.conf"
AVAIL="/etc/nginx/sites-available/admin.litkom-m52.ru"
ENABLED="/etc/nginx/sites-enabled/admin.litkom-m52.ru"
DOMAIN="admin.litkom-m52.ru"

if [[ ! -f "$SRC_CONF" ]]; then
  echo "ERROR: missing $SRC_CONF"
  exit 1
fi

echo "==> install nginx site $DOMAIN"
install -m 644 "$SRC_CONF" "$AVAIL"
ln -sfn "$AVAIL" "$ENABLED"

# Point store /admin to the admin host (idempotent snippet).
STORE_CONF="/etc/nginx/sites-available/litkom-m52.ru"
if [[ -f "$STORE_CONF" ]] && ! grep -q 'admin.litkom-m52.ru/\$\|admin.litkom-m52.ru/;' "$STORE_CONF"; then
  echo "==> add /admin redirect on store vhost"
  python3 - <<'PY'
from pathlib import Path
path = Path("/etc/nginx/sites-available/litkom-m52.ru")
text = path.read_text()
# Normalize any previous /admin → admin host /admin redirects to bare origin.
text = text.replace(
    "return 301 https://admin.litkom-m52.ru/admin;",
    "return 301 https://admin.litkom-m52.ru/;",
)
text = text.replace(
    "return 301 https://admin.litkom-m52.ru$request_uri;",
    "return 301 https://admin.litkom-m52.ru/;",
)
needle = "    location / {\n        proxy_pass http://127.0.0.1:4173;"
insert = """    location = /admin {
        return 301 https://admin.litkom-m52.ru/;
    }

    location /admin/ {
        return 301 https://admin.litkom-m52.ru/;
    }

    location / {
        proxy_pass http://127.0.0.1:4173;"""
if "location = /admin" not in text:
    if needle not in text:
        raise SystemExit("store nginx conf shape unexpected; add /admin redirects manually")
    text = text.replace(needle, insert, 1)
path.write_text(text)
print("patched", path)
PY
fi

nginx -t
systemctl reload nginx

if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  echo "==> certbot for $DOMAIN"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
else
  echo "==> cert already present for $DOMAIN"
  certbot install --cert-name "$DOMAIN" --nginx --non-interactive 2>/dev/null || true
  nginx -t
  systemctl reload nginx
fi

echo "==> checks"
curl -sS -o /dev/null -w "http:%{http_code} %{url_effective}\n" --connect-timeout 10 "http://${DOMAIN}/" || true
curl -sS -o /dev/null -w "https:%{http_code}\n" --connect-timeout 10 "https://${DOMAIN}/" || true
echo "Admin vhost OK → https://${DOMAIN}/"
