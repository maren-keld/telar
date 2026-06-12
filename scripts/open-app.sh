#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Telar.app"

if [[ ! -d "$APP" ]]; then
  echo "No existe dist/Telar.app — ejecuta primero: ./scripts/build-app.sh"
  exit 1
fi

if [[ -f "$ROOT/dist/.build-label" ]]; then
  echo "Build: $(cat "$ROOT/dist/.build-label")"
elif [[ -f "$ROOT/dist/.build-stamp" ]]; then
  echo "Build: $(cat "$ROOT/dist/.build-stamp")"
fi

# Cerrar instancias viejas (p. ej. otra copia en /Applications o en target/)
osascript -e 'quit app "Telar"' 2>/dev/null || true
pkill -x telar 2>/dev/null || true
sleep 0.4

# Avisar si hay otra copia instalada distinta a la canónica
if [[ -d "/Applications/Telar.app" ]]; then
  if ! diff -rq "$APP" "/Applications/Telar.app" >/dev/null 2>&1; then
    echo ""
    echo "Aviso: /Applications tiene otra versión distinta."
    echo "  Para alinear: ./scripts/install-app.sh"
    echo "  O abre solo esta (recomendado ahora): $APP"
    echo ""
  fi
fi

open "$APP"
