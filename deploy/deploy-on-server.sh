#!/usr/bin/env bash
# Deploy litcom52 on the production host (self-hosted runner / local on VPS).
# Expects to run on the VPS that serves https://litkom-m52.ru/
#
# Usage:
#   bash deploy/deploy-on-server.sh
#   GITHUB_WORKSPACE=/path/to/checkout bash deploy/deploy-on-server.sh

set -euo pipefail

SRC_DIR="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST_DIR="${DEPLOY_REMOTE_DIR:-/opt/litcom52}"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "ERROR: source checkout not found: $SRC_DIR"
  exit 1
fi

if [[ ! -f "$DEST_DIR/.env" ]]; then
  echo "ERROR: $DEST_DIR/.env missing — create it before deploying"
  exit 1
fi

echo "==> sync $SRC_DIR -> $DEST_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude .vscode \
  --exclude .env \
  --exclude .env.\* \
  --exclude data/orders.json \
  --exclude data/sync.lock \
  --exclude _work \
  "${SRC_DIR}/" "${DEST_DIR}/"

id -u litcom >/dev/null 2>&1 || useradd --system --home "$DEST_DIR" --shell /usr/sbin/nologin litcom
chown -R litcom:litcom "$DEST_DIR"
chmod 600 "$DEST_DIR/.env"
mkdir -p "$DEST_DIR/data"
chown -R litcom:litcom "$DEST_DIR/data"

echo "==> npm ci + build"
cd "$DEST_DIR"
sudo -u litcom npm ci
sudo -u litcom npm run build

echo "==> restart litcom52"
systemctl restart litcom52
sleep 2
systemctl is-active litcom52 nginx
curl -sS -o /dev/null -w "home:%{http_code}\n" http://127.0.0.1:4173/
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:4173/healthz
curl -sS -o /dev/null -w "https:%{http_code}\n" --connect-timeout 15 https://litkom-m52.ru/ || true
curl -sS -o /dev/null -w "admin:%{http_code}\n" --connect-timeout 15 https://admin.litkom-m52.ru/admin || true

echo "Deploy OK → https://litkom-m52.ru/ · https://admin.litkom-m52.ru/admin"
