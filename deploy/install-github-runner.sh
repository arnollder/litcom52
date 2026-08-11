#!/usr/bin/env bash
# Install GitHub Actions self-hosted runner for litcom52 on this VPS.
# Run as root on the production host:
#   REGISTRATION_TOKEN=... bash deploy/install-github-runner.sh
#
# Token from laptop:
#   gh api -X POST repos/arnollder/litcom52/actions/runners/registration-token --jq .token

set -euo pipefail

REPO_URL="${RUNNER_REPO_URL:-https://github.com/arnollder/litcom52}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_USER="${RUNNER_USER:-actions}"
RUNNER_NAME="${RUNNER_NAME:-litkom-m52}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,litcom52}"
RUNNER_VERSION="${RUNNER_VERSION:-2.336.0}"

if [[ -z "${REGISTRATION_TOKEN:-}" ]]; then
  echo "ERROR: set REGISTRATION_TOKEN"
  echo "  gh api -X POST repos/arnollder/litcom52/actions/runners/registration-token --jq .token"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root"
  exit 1
fi

id -u "$RUNNER_USER" >/dev/null 2>&1 || \
  useradd --system --create-home --home-dir "/home/$RUNNER_USER" --shell /bin/bash "$RUNNER_USER"

WORK_DEPLOY="${RUNNER_DIR}/_work/litcom52/litcom52/deploy/deploy-on-server.sh"
cat >/etc/sudoers.d/actions-litcom52 <<EOF
# Auto-deploy for GitHub Actions self-hosted runner
${RUNNER_USER} ALL=(root) NOPASSWD: /bin/bash ${WORK_DEPLOY}, /usr/bin/bash ${WORK_DEPLOY}
EOF
chmod 440 /etc/sudoers.d/actions-litcom52
visudo -cf /etc/sudoers.d/actions-litcom52

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}"

if [[ ! -f ./config.sh ]]; then
  curl -fsSL -o "$ARCHIVE" "$URL"
  tar xzf "$ARCHIVE"
  rm -f "$ARCHIVE"
fi

chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

if [[ -f .runner ]]; then
  sudo -u "$RUNNER_USER" ./svc.sh stop || true
  sudo -u "$RUNNER_USER" ./config.sh remove --token "$REGISTRATION_TOKEN" || true
fi

sudo -u "$RUNNER_USER" ./config.sh \
  --url "$REPO_URL" \
  --token "$REGISTRATION_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --work "_work" \
  --unattended \
  --replace

./svc.sh install "$RUNNER_USER"
./svc.sh start
./svc.sh status || true

echo
echo "Runner installed: $RUNNER_NAME ($RUNNER_LABELS)"
echo "Check: gh api repos/arnollder/litcom52/actions/runners --jq '.runners[]|{name,status,labels:[.labels[].name]}'"
