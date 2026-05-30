#!/bin/zsh
set -euo pipefail

LABEL="com.apoorvdarshan.personal-crossposter"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Personal Crossposter local auto-start service removed."
