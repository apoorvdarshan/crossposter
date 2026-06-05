#!/bin/sh
set -eu

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CROSSPOSTER_DATA_DIR:-$APP_DIR}"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install -r "$APP_DIR/requirements.txt"
.venv/bin/python -m pip install --no-deps "moviepy==2.2.1"
