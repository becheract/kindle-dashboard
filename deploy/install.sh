#!/usr/bin/env bash
# Installs or updates Marginalia on Ubuntu. Run from the repo folder:  sudo ./deploy/install.sh
set -euo pipefail

APP_DIR=/opt/marginalia
DATA_DIR=/var/lib/marginalia
ENV_FILE=/etc/marginalia.env
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo ./deploy/install.sh" >&2; exit 1; fi

# Node 22.6 or newer (needed for built-in SQLite and TypeScript support).
need_node=true
if command -v node >/dev/null; then
  IFS=. read -r major minor _ <<<"$(node -p 'process.versions.node')"
  if (( major > 22 || (major == 22 && minor >= 6) )); then need_node=false; fi
fi
if $need_node; then
  echo "Installing Node.js 22..."
  apt-get update
  apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Using Node $(node -v)"

id marginalia >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin marginalia
mkdir -p "$APP_DIR" "$DATA_DIR"
chown marginalia:marginalia "$DATA_DIR"

echo "Copying app to $APP_DIR..."
rm -rf "$APP_DIR/src"
cp -r "$REPO_DIR"/{package.json,package-lock.json,src} "$APP_DIR"/
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)

if [[ ! -f $ENV_FILE ]]; then
  cp "$REPO_DIR/deploy/marginalia.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE. Edit it to change the port or time zone."
fi

cp "$REPO_DIR/deploy/marginalia.service" /etc/systemd/system/marginalia.service
systemctl daemon-reload
systemctl enable marginalia >/dev/null
systemctl restart marginalia

sleep 2
port=$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2); port=${port:-3000}
if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null; then
  ip=$(hostname -I | awk '{print $1}')
  echo "Marginalia is running. Open http://$ip:$port on any device on your network."
else
  echo "Marginalia didn't start. See the log with: journalctl -u marginalia -n 50" >&2
  exit 1
fi
