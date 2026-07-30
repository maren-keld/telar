#!/usr/bin/env bash
# Escribe src/js/ai-secrets.js para builds comerciales (no commitear con clave real).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/js/ai-secrets.js"
KEY="${MISTRAL_API_KEY:-}"
if [[ -z "$KEY" && -f "$ROOT/secrets/mistral-api.key" ]]; then
  KEY="$(tr -d '[:space:]' < "$ROOT/secrets/mistral-api.key")"
fi
cat > "$OUT" <<EOF
/** Generado por scripts/write-ai-secrets.sh — no editar a mano */
export const BUNDLED_MISTRAL_API_KEY = '${KEY}';
EOF
if [[ -n "$KEY" ]]; then
  echo "✓ ai-secrets.js (clave Mistral embebida para release)"
else
  echo "→ ai-secrets.js vacío (sin MISTRAL_API_KEY ni secrets/mistral-api.key)"
fi
