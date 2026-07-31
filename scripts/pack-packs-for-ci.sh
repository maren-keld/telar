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
  for src in "$ROOT/packs/$p" "$ROOT/packs-src/$p" "$ROOT/src/packs/$p"; do
    if [[ -d "$src" ]]; then
      cp -R "$src" "$TMP/packs/$p"
      break
    fi
  done
  if [[ "$p" != "clinical-shared" ]]; then
    rm -rf "$TMP/packs/$p/handouts"
  fi
done
cat > "$TMP/src/packs/index.json" <<'EOF'
{"packs":["clinical-shared","tdah-adulto","trauma-regulacion"]}
EOF

tar -czf "$OUT" -C "$TMP" packs src/packs/index.json
echo "✓ Bundle CI: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
