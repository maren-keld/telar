#!/usr/bin/env bash
# Copia el instalador NSIS de Tauri a dist/Telar-windows.exe
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CARGO_TARGET="${CARGO_TARGET_DIR:-$ROOT/src-tauri/target}"

# CI usa --target x86_64-pc-windows-msvc → bundle bajo target/<triple>/release/…
NSIS_DIR=""
for candidate in \
  "$CARGO_TARGET/x86_64-pc-windows-msvc/release/bundle/nsis" \
  "$CARGO_TARGET/release/bundle/nsis"; do
  if [[ -d "$candidate" ]]; then
    NSIS_DIR="$candidate"
    break
  fi
done
OUT="$ROOT/dist/Telar-windows.exe"

if [[ -z "$NSIS_DIR" ]]; then
  echo "Error: no se encontró bundle/nsis en $CARGO_TARGET — compila en Windows con: ./scripts/build-app.sh"
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
