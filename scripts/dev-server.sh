#!/usr/bin/env bash
# Servidor de desarrollo con recarga automática al guardar (CSS/HTML/JS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

find_npx() {
  if command -v npx >/dev/null 2>&1; then
    command -v npx
    return
  fi
  for candidate in /opt/homebrew/bin/npx /usr/local/bin/npx; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  return 1
}

NPX="$(find_npx || true)"

if [[ -n "$NPX" ]]; then
  exec "$NPX" --yes live-server "$ROOT/src" \
    --port=1420 \
    --host=127.0.0.1 \
    --no-browser \
    --wait=250 \
    --ignore="**/.git/**"
fi

echo ""
echo "⚠ Node.js no está instalado (falta npx para recarga automática del frontend)."
echo ""
echo "  Opción A — instalar Node (recomendado para desarrollo):"
echo "    brew install node"
echo "    ./scripts/dev.sh"
echo ""
echo "  Opción B — servidor simple sin recarga automática (solo esta sesión):"
echo "    python3 -m http.server 1420 --bind 127.0.0.1 --directory src"
echo ""
echo "  Opción C — probar la .app compilada (suscripciones usan Render, no localhost):"
echo "    ./scripts/open-app.sh"
echo ""
exec python3 -m http.server 1420 --bind 127.0.0.1 --directory "$ROOT/src"
