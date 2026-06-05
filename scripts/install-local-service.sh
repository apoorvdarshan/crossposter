#!/bin/zsh
set -euo pipefail

LABEL="com.apoorvdarshan.crossposter"
APP_DIR="${CROSSPOSTER_APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DATA_DIR="${CROSSPOSTER_DATA_DIR:-$APP_DIR}"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
PORT_VALUE="${1:-${POSTER_LOCAL_PORT:-2004}}"
CONFIG_PATH="$DATA_DIR/poster.config.local.json"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$DATA_DIR"

node - "$PORT_VALUE" "$CONFIG_PATH" <<'NODE'
const fs = require("node:fs");
const port = process.argv[2];
const configPath = process.argv[3];
const isValidPort = /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535;

if (!isValidPort) {
  throw new Error(`Invalid POSTER_LOCAL_PORT: ${port}`);
}

let config = {};

try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch {}

config.values = {
  ...(config.values || {}),
  POSTER_LOCAL_PORT: port
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "$APP_DIR" &amp;&amp; CROSSPOSTER_DATA_DIR="$DATA_DIR" npm run dev:local</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/crossposter.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/crossposter.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST_PATH" >/dev/null
launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Crossposter will start after login and stay running at http://localhost:$PORT_VALUE"
echo "Config file: $CONFIG_PATH"
