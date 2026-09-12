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

MISSING=()
for p in "${PACKS[@]}"; do
  found=
  for src in "$ROOT/packs/$p" "$ROOT/packs-src/$p" "$ROOT/src/packs/$p"; do
    if [[ -d "$src" ]]; then
      cp -R "$src" "$TMP/packs/$p"
      found=1
      break
    fi
  done
  if [[ -z "$found" ]]; then
    MISSING+=("$p")
    continue
  fi
  if [[ "$p" != "clinical-shared" ]]; then
    rm -rf "$TMP/packs/$p/handouts"
  fi
done
if (( ${#MISSING[@]} )); then
  echo "Error: faltan packs listados en scripts/clinical-packs.txt: ${MISSING[*]}" >&2
  echo "Copia packs/ o src/packs/ locales y vuelve a correr." >&2
  exit 1
fi
printf '{"packs":[' > "$TMP/src/packs/index.json"
for i in "${!PACKS[@]}"; do
  [[ $i -gt 0 ]] && printf ',' >> "$TMP/src/packs/index.json"
  printf '"%s"' "${PACKS[$i]}" >> "$TMP/src/packs/index.json"
done
printf ']}\n' >> "$TMP/src/packs/index.json"

tar -czf "$OUT" -C "$TMP" packs src/packs/index.json

# Verificación: el tarball debe contener cada pack de clinical-packs.txt.
VERIFY_MISSING=()
for p in "${PACKS[@]}"; do
  tar -tzf "$OUT" "packs/$p/" >/dev/null 2>&1 || VERIFY_MISSING+=("$p")
done
if (( ${#VERIFY_MISSING[@]} )); then
  echo "Error: el bundle no incluye: ${VERIFY_MISSING[*]}" >&2
  rm -f "$OUT"
  exit 1
fi

echo "✓ Bundle CI: $OUT ($(du -h "$OUT" | awk '{print $1}')) — packs: ${PACKS[*]}"
