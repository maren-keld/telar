#!/usr/bin/env bash
# Empaqueta packs clínicos para CI (Windows/macOS) — no distribuir a usuarios finales.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/telar-packs-bundle.tar.gz"
mkdir -p "$ROOT/dist"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/packs" "$TMP/src/packs"
# Lista unica en scripts/clinical-packs.txt — ver cabecera de ese archivo.
PACKS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"   # checkout de Windows deja CRLF
  [[ -z "$line" || "$line" == \#* ]] && continue
  PACKS+=("$line")
done < "$ROOT/scripts/clinical-packs.txt"

for p in "${PACKS[@]}"; do
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
printf '{"packs":[' > "$TMP/src/packs/index.json"
for i in "${!PACKS[@]}"; do
  [[ $i -gt 0 ]] && printf ',' >> "$TMP/src/packs/index.json"
  printf '"%s"' "${PACKS[$i]}" >> "$TMP/src/packs/index.json"
done
printf ']}\n' >> "$TMP/src/packs/index.json"

tar -czf "$OUT" -C "$TMP" packs src/packs/index.json
echo "✓ Bundle CI: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
