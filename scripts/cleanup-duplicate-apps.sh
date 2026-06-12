#!/usr/bin/env bash
# Deja una sola .app canónica dentro del repo; avisa sobre copias extra en el Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL="$ROOT/dist/Telar.app"
TARGET_BUNDLE="$ROOT/src-tauri/target/release/bundle/macos/Telar.app"
TARGET_DEBUG="$ROOT/src-tauri/target/debug/bundle/macos/Telar.app"

removed=0
for extra in "$TARGET_BUNDLE" "$TARGET_DEBUG"; do
  if [[ -d "$extra" ]]; then
    rm -rf "$extra"
    echo "→ Eliminada copia duplicada en repo: $extra"
    removed=$((removed + 1))
  fi
done

echo ""
echo "Copias de «Telar.app» encontradas:"
found=0
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  found=$((found + 1))
  if [[ "$path" == "$CANONICAL" ]]; then
    echo "  ✓ [canónica] $path"
  else
    echo "  · $path"
  fi
done < <(
  {
    find "$ROOT" -name "Telar.app" -type d 2>/dev/null
    [[ -d "/Applications/Telar.app" ]] && echo "/Applications/Telar.app"
  } | sort -u
)

if [[ $found -eq 0 ]]; then
  echo "  (ninguna — ejecuta ./scripts/build-app.sh)"
elif [[ $found -gt 1 ]]; then
  echo ""
  echo "Hay más de una copia. La buena es:"
  echo "  $CANONICAL"
  echo ""
  echo "Se eliminarán automáticamente las copias extra del repo (target/…)."
  for extra in "$TARGET_BUNDLE" "$TARGET_DEBUG"; do
    if [[ -d "$extra" && "$extra" != "$CANONICAL" ]]; then
      rm -rf "$extra"
      echo "  → Eliminada: $extra"
    fi
  done
  echo ""
  echo "Abre solo: ./scripts/open-app.sh"
  echo "Si también tienes /Applications/Telar.app distinta, ejecuta: ./scripts/install-app.sh"
fi

if [[ $removed -gt 0 ]]; then
  echo ""
  echo "→ Se quitaron $removed copia(s) extra del proyecto."
fi
