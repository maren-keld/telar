#!/usr/bin/env bash
# Copia landing/ del repo a iCloud Drive → Telar/landing (sitio telarapp.cl).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
DEST="$ICLOUD/Telar/landing"

mkdir -p "$DEST"
rsync -a --delete "$ROOT/landing/" "$DEST/"
echo "Listo: $DEST"
echo "Sitio en iCloud: Telar/landing"
