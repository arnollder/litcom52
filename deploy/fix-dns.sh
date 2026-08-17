#!/usr/bin/env bash
# Fix broken VPS DNS (provider sometimes seeds 198.18.18.18 via cloud-init).
# Usage on server: bash deploy/fix-dns.sh

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root on the VPS"
  exit 1
fi

mkdir -p /etc/systemd/resolved.conf.d /etc/cloud/cloud.cfg.d

cat >/etc/systemd/resolved.conf.d/99-litcom-dns.conf <<'EOF'
[Resolve]
DNS=8.8.8.8 1.1.1.1
FallbackDNS=9.9.9.9
EOF

cat >/etc/cloud/cloud.cfg.d/99-litcom-resolv.conf <<'EOF'
manage_resolv_conf: false
EOF

resolvectl dns eth0 8.8.8.8 1.1.1.1 || true
systemctl restart systemd-resolved

# cloud-init leaves a static resolv.conf with the broken provider DNS — relink it.
rm -f /etc/resolv.conf
ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
systemctl restart systemd-resolved

echo "==> DNS check"
dig +short api.moysklad.ru A || true
curl -sS -o /dev/null -w "moysklad:%{http_code}\n" --max-time 15 \
  https://api.moysklad.ru/api/remap/1.2/entity/organization?limit=1 || true
curl -sS -o /dev/null -w "stock:%{http_code}\n" --max-time 120 http://127.0.0.1:4173/api/stock || true

echo "DNS fix applied"
