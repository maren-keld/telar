#!/usr/bin/env bash
# Deja UNA sola copia en /Applications (reemplaza la anterior)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/Telar.app"
DEST="/Applications/Telar.app"

if [[ ! -d "$SRC" ]]; then
  echo "Primero: ./scripts/build-app.sh"
  exit 1
fi

rm -rf "$DEST"
rm -rf "/Applications/Psicoterapia Lab.app" "/Applications/Psicoterapia LAB.app" 2>/dev/null || true
cp -R "$SRC" "$DEST"
echo "✓ Instalado: $DEST"
echo "  (Se eliminó la copia antigua «Psicoterapia Lab» si existía en Aplicaciones)"
