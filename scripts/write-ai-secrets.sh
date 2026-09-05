#!/usr/bin/env bash
# La clave de Mistral ya no se embebe en el instalador.
# El servidor la entrega al activar la IA (MISTRAL_API_KEY en Render).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/js/ai-secrets.js"
cat > "$OUT" <<'EOF'
/** Generado por scripts/write-ai-secrets.sh — la clave ya no viaja en el .app */
export const BUNDLED_MISTRAL_API_KEY = '';
EOF
echo "→ ai-secrets.js vacío (Mistral se provisiona en el servidor)"
