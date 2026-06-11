#!/usr/bin/env bash
# Servidor de desarrollo con recarga automática al guardar (CSS/HTML/JS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec npx --yes live-server "$ROOT/src" \
  --port=1420 \
  --host=127.0.0.1 \
  --no-browser \
  --wait=250 \
  --ignore="**/.git/**"
