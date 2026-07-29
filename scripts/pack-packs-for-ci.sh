#!/usr/bin/env bash
# Empaqueta packs clínicos para CI (Windows/macOS) — no distribuir a usuarios finales.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/telar-packs-bundle.tar.gz"
mkdir -p "$ROOT/dist"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/packs" "$TMP/src/packs"
for p in clinical-shared tdah-adulto trauma-regulacion; do
  if [[ -d "$ROOT/packs/$p" ]]; then
    cp -R "$ROOT/packs/$p" "$TMP/packs/$p"
  elif [[ -d "$ROOT/src/packs/$p" ]]; then
    cp -R "$ROOT/src/packs/$p" "$TMP/packs/$p"
  fi
done
cat > "$TMP/src/packs/index.json" <<'EOF'
{"packs":["clinical-shared","tdah-adulto","trauma-regulacion"]}
EOF

tar -czf "$OUT" -C "$TMP" packs src/packs/index.json
echo "✓ Bundle CI: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
