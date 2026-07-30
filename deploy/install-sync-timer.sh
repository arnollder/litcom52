#!/usr/bin/env bash
# Install MoySklad sync systemd timer on the production host.
# Usage (as root on the VPS):
#   bash /opt/litcom52/deploy/install-sync-timer.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR=/etc/systemd/system

install -m 0644 "$ROOT_DIR/deploy/litcom52-sync.service" "$UNIT_DIR/litcom52-sync.service"
install -m 0644 "$ROOT_DIR/deploy/litcom52-sync.timer" "$UNIT_DIR/litcom52-sync.timer"

systemctl daemon-reload
systemctl enable --now litcom52-sync.timer
systemctl status litcom52-sync.timer --no-pager -l || true

echo
echo "Timer installed. Useful commands:"
echo "  systemctl list-timers litcom52-sync.timer"
echo "  systemctl start litcom52-sync.service   # run once now"
echo "  journalctl -u litcom52-sync.service -n 50 --no-pager"
