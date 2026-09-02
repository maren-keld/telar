#!/usr/bin/env bash
# La página del paciente (landing/r) corre en Vercel y no puede importar desde
# src/lib, así que usa una copia byte a byte. Este script la actualiza; el test
# tests/frontend/share-lib-sync.test.js falla si alguien edita una sola copia.
set -euo pipefail

cd "$(dirname "$0")/.."

for f in questionnaire-schema.js share-crypto.js; do
  cp "src/lib/$f" "landing/r/js/$f"
  echo "copiado src/lib/$f -> landing/r/js/$f"
done
