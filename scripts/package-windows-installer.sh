#!/usr/bin/env bash
# Copia el instalador NSIS de Tauri a dist/Telar-windows.exe
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CARGO_TARGET="${CARGO_TARGET_DIR:-$ROOT/src-tauri/target}"
NSIS_DIR="$CARGO_TARGET/release/bundle/nsis"
OUT="$ROOT/dist/Telar-windows.exe"

if [[ ! -d "$NSIS_DIR" ]]; then
  echo "Error: no existe $NSIS_DIR — compila en Windows con: ./scripts/build-app.sh"
  exit 1
fi

SETUP="$(find "$NSIS_DIR" -maxdepth 1 -name '*-setup.exe' | head -1)"
if [[ -z "$SETUP" ]]; then
  echo "Error: no se encontró *-setup.exe en $NSIS_DIR"
  exit 1
fi

mkdir -p "$ROOT/dist"
cp "$SETUP" "$OUT"
echo "✓ Instalador Windows: $OUT"
