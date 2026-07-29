#!/usr/bin/env bash
# Build release completo: copia packs propietarios al bundle y ejecuta tauri build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Copiando packs propietarios a src/packs/"
mkdir -p src/packs

# Fuente: packs/ o packs-src/ en raíz (privado) o src/packs/ ya presente en dev
for p in clinical-shared tdah-adulto trauma-regulacion; do
  for src in "$ROOT/packs/$p" "$ROOT/packs-src/$p" "$ROOT/src/packs/$p"; do
    if [[ -d "$src" ]]; then
      echo "  + $p"
      rm -rf "src/packs/$p"
      cp -R "$src" "src/packs/$p"
      break
    fi
  done
done

# Índice release full (sin demo stub)
if [[ -f "$ROOT/src/packs/index.json" ]]; then
  cp "$ROOT/src/packs/index.json" "$ROOT/src/packs/.index.release.json"
fi
cat > src/packs/index.json <<'EOF'
{"packs":["clinical-shared","tdah-adulto","trauma-regulacion"]}
EOF

echo "==> Build app"
"$ROOT/scripts/build-app.sh"

echo ""
echo "Release full listo. Packs clínicos embebidos en src/packs/."
