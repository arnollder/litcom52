#!/usr/bin/env bash
# Deploy litcom52 to production VPS.
# Usage (from repo root):
#   bash deploy/deploy-vps.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-root@62.113.110.31}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/litcom52}"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15)

echo "==> rsync -> ${HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude .vscode \
  --exclude .env \
  --exclude .env.\* \
  --exclude data/orders.json \
  --exclude data/sync.lock \
  -e "ssh -i ${SSH_KEY} -o BatchMode=yes -o ConnectTimeout=15" \
  "${ROOT_DIR}/" "${HOST}:${REMOTE_DIR}/"

echo "==> remote build + restart"
"${SSH[@]}" "$HOST" "set -e
if [ ! -f ${REMOTE_DIR}/.env ]; then echo \"ERROR: ${REMOTE_DIR}/.env missing\"; exit 1; fi
id -u litcom >/dev/null 2>&1 || useradd --system --home ${REMOTE_DIR} --shell /usr/sbin/nologin litcom
chown -R litcom:litcom ${REMOTE_DIR}
chmod 600 ${REMOTE_DIR}/.env
mkdir -p ${REMOTE_DIR}/data
chown -R litcom:litcom ${REMOTE_DIR}/data
cd ${REMOTE_DIR}
sudo -u litcom npm ci
sudo -u litcom npm run build
systemctl restart litcom52
sleep 2
systemctl is-active litcom52 nginx
curl -sS -o /dev/null -w 'home:%{http_code}\\n' http://127.0.0.1:4173/
curl -sS -o /dev/null -w 'health:%{http_code}\\n' http://127.0.0.1:4173/healthz
"

echo "==> public check"
curl -sS -o /dev/null -w "https:%{http_code}\\n" --connect-timeout 15 https://litkom-m52.ru/
curl -sS -o /dev/null -w "admin:%{http_code}\\n" --connect-timeout 15 https://admin.litkom-m52.ru/admin || true
echo "Deploy OK → https://litkom-m52.ru/ · https://admin.litkom-m52.ru/admin"
