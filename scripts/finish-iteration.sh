#!/usr/bin/env bash
# Al terminar cambios en src/: build + verificación + una sola .app (no toca la base de datos).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/build-app.sh"
"$ROOT/scripts/cleanup-duplicate-apps.sh"
echo ""
echo "Listo. Abre la app actualizada:"
echo "  ./scripts/open-app.sh"
