#!/usr/bin/env bash
# Prepare nginx on the VPS for Cloudflare reverse proxy (real client IP).
# Run on the server as root:
#   bash /opt/litcom52/deploy/setup-cloudflare-origin.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/etc/nginx/conf.d/cloudflare-real-ip.conf"
TMP="$(mktemp)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root on the VPS"
  exit 1
fi

echo "==> fetch Cloudflare IP ranges"
V4="$(curl -fsSL https://www.cloudflare.com/ips-v4)"
V6="$(curl -fsSL https://www.cloudflare.com/ips-v6)"

{
  echo "# Trust Cloudflare proxy — restore visitor IP in \$remote_addr."
  echo "# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") by deploy/setup-cloudflare-origin.sh"
  echo
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
  echo
  while IFS= read -r cidr; do
    [[ -n "$cidr" ]] && echo "set_real_ip_from ${cidr};"
  done <<<"$V4"
  while IFS= read -r cidr; do
    [[ -n "$cidr" ]] && echo "set_real_ip_from ${cidr};"
  done <<<"$V6"
} >"$TMP"

install -m 644 "$TMP" "$DEST"
rm -f "$TMP"

# Keep repo copy in sync when run from checkout.
if [[ -f "${ROOT_DIR}/deploy/nginx/cloudflare-real-ip.conf" ]]; then
  cp "$DEST" "${ROOT_DIR}/deploy/nginx/cloudflare-real-ip.conf" 2>/dev/null || true
fi

echo "==> test nginx"
nginx -t
systemctl reload nginx

echo "OK: ${DEST} installed and nginx reloaded"
echo "Next: enable Cloudflare proxy (orange cloud) for litkom-m52.ru, www, admin — see deploy/CLOUDFLARE.md"
