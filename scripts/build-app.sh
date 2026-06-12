#!/usr/bin/env bash
# Una sola .app canónica: dist/Telar.app (no abras la de src-tauri/target/…)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

source "$HOME/.cargo/env" 2>/dev/null || true

export CARGO_TARGET_DIR="$ROOT/src-tauri/target"
CANONICAL="$ROOT/dist/Telar.app"
STAMP_FILE="$ROOT/dist/.build-stamp"

echo "→ Sidecar Python…"
"$ROOT/scripts/build-sidecar.sh"

if [[ -f "$ROOT/app-icon.png" ]]; then
  echo "→ Iconos…"
  (cd "$ROOT/src-tauri" && cargo tauri icon "$ROOT/app-icon.png") 2>/dev/null || true
fi

echo "→ Invalidando caché de assets del frontend…"
rm -rf "$CARGO_TARGET_DIR/release/build/telar-"*

echo "→ Compilando (frontend src/ embebido en la .app)…"
cd "$ROOT/src-tauri"
cargo tauri build

ASSETS_DIR="$(find "$CARGO_TARGET_DIR/release/build" -maxdepth 1 -type d -name 'telar-*' 2>/dev/null | head -1)/out/tauri-codegen-assets"
if [[ ! -d "$ASSETS_DIR" ]]; then
  echo "Error: no se generaron assets embebidos en $ASSETS_DIR"
  exit 1
fi
python3 "$ROOT/scripts/verify-frontend-embedded.py" "$ASSETS_DIR"

BUILT="$CARGO_TARGET_DIR/release/bundle/macos/Telar.app"
mkdir -p "$ROOT/dist"

if [[ ! -d "$BUILT" ]]; then
  echo "Error: no se generó $BUILT"
  exit 1
fi

rm -rf "$CANONICAL"
cp -R "$BUILT" "$CANONICAL"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_FILE"
date "+%a %e %b %H:%M" | tr '[:upper:]' '[:lower:]' | sed 's/  / /g;s/^ //' > "$ROOT/dist/.build-label"

# Evitar dos iconos en Finder dentro del proyecto: quitar copia en target tras publicar en dist/
rm -rf "$BUILT"
"$ROOT/scripts/cleanup-duplicate-apps.sh"

if [[ "${SIGN_MACOS:-}" == "1" ]]; then
  echo "→ Firma / notarización macOS…"
  "$ROOT/scripts/sign-macos-app.sh" "$CANONICAL"
fi

echo ""
echo "✓ App única: $CANONICAL"
echo "  Abrir:  ./scripts/open-app.sh"
echo "  Instalar en Aplicaciones (opcional): ./scripts/install-app.sh"
echo "  Distribuir en otro Mac: SIGN_MACOS=1 ./scripts/build-app.sh  (requiere Developer ID)"
echo ""
echo "  En desarrollo con cambios al vuelo: ./scripts/dev.sh  (no uses la .app de dist)"
