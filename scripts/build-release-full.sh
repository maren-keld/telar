#!/usr/bin/env bash
# Build release completo: copia packs propietarios al bundle y ejecuta tauri build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Copiando packs propietarios a src/packs/"
mkdir -p src/packs

# Fuente: packs/ en raíz (privado) o src/packs/ ya presente en dev
if [[ -d "$ROOT/packs" ]]; then
  for dir in "$ROOT/packs"/*/; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    [[ "$name" == "demo" ]] && continue
    echo "  + $name"
    rm -rf "src/packs/$name"
    cp -R "$dir" "src/packs/$name"
  done
fi

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
