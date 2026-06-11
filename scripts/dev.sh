#!/usr/bin/env bash
# Modo desarrollo: ventana nativa + recarga del frontend con Cmd+R (o F5 en DevTools)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if [[ ! -f "$ROOT/src-tauri/binaries/analyze_session-aarch64-apple-darwin" ]] \
  && [[ ! -f "$ROOT/src-tauri/binaries/analyze_session-x86_64-apple-darwin" ]]; then
  echo "→ Primera vez: compilando sidecar de análisis…"
  "$ROOT/scripts/build-sidecar.sh"
fi

echo "→ Psicoterapia Lab (MODO DEV)"
echo "   • Guarda un archivo en src/ → la ventana se recarga sola (CSS/HTML/JS)"
echo "   • Si no recarga: Cmd+R en la ventana de la app"
echo "   • NO uses build-app.sh para probar CSS — solo para la .app final"
echo ""

cd "$ROOT/src-tauri"
exec cargo tauri dev
