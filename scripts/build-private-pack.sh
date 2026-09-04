#!/usr/bin/env bash
# Empaqueta un pack privado de packs-src/private/<id>/ en dist/private/<id>.telarpack.
#
# Los packs privados contienen material con licencia que NO puede distribuirse con
# Telar (ver packs-src/private/<id>/pack.json). El archivo resultante se entrega a
# mano a quien tiene derecho de usarlo y nunca entra a git ni a una release.
#
# Uso: ./scripts/build-private-pack.sh autismo-danyau
set -euo pipefail

ID="${1:-}"
if [[ -z "$ID" ]]; then
  echo "Uso: $0 <id-del-pack>" >&2
  echo "Disponibles:" >&2
  ls -1 "$(cd "$(dirname "$0")/.." && pwd)/packs-src/private" 2>/dev/null | sed 's/^/  - /' >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packs-src/private/$ID"
OUT="$ROOT/dist/private/$ID.telarpack"

[[ -d "$SRC" ]] || { echo "No existe $SRC" >&2; exit 1; }
[[ -f "$SRC/pack.json" ]] || { echo "Falta $SRC/pack.json" >&2; exit 1; }

node "$ROOT/scripts/validate-private-pack.mjs" "$SRC"

mkdir -p "$ROOT/dist/private"
rm -f "$OUT"
# .telarpack es un tar.gz: Telar lo abre con flate2 + tar, sin dependencias extra.
# COPYFILE_DISABLE evita los `._*` de resource fork que mete tar en macOS.
export COPYFILE_DISABLE=1
DIRS=(pack.json)
for d in questionnaires interactive assets; do
  [[ -d "$SRC/$d" ]] && DIRS+=("$d")
done
tar -czf "$OUT" -C "$SRC" --exclude '.*' "${DIRS[@]}"
[[ -f "$OUT" ]] || { echo "El paquete no se generó" >&2; exit 1; }

echo "✓ Pack privado: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
echo "  Entregar por canal privado. No commitear, no subir a releases."
