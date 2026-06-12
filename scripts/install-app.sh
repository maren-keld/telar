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
cp -R "$SRC" "$DEST"
echo "✓ Instalado: $DEST"
echo "  (Solo deberías ver un icono de Telar en Aplicaciones)"
