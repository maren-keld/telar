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
  # Packs con depends: clinical-shared — handouts solo en shared (Vía B)
  if [[ "$p" != "clinical-shared" && -f "src/packs/$p/pack.json" ]]; then
    rm -rf "src/packs/$p/handouts"
  fi
done

# Índice release full (sin demo stub)
if [[ -f "$ROOT/src/packs/index.json" ]]; then
  cp "$ROOT/src/packs/index.json" "$ROOT/src/packs/.index.release.json"
fi
# Lista unica en scripts/clinical-packs.txt — ver cabecera de ese archivo.
python3 -c "
import json, pathlib
packs = [l.strip() for l in pathlib.Path('scripts/clinical-packs.txt').read_text().splitlines()
         if l.strip() and not l.startswith('#')]
pathlib.Path('src/packs/index.json').write_text(json.dumps({'packs': packs}) + '\n')
print('→ index.json de release:', packs)
"

echo "==> Clave Mistral embebida (release comercial)"
chmod +x "$ROOT/scripts/write-ai-secrets.sh"
"$ROOT/scripts/write-ai-secrets.sh"

if ! grep -q 'clinical-shared' src/packs/index.json; then
  echo "Error: index.json de release debe listar packs clínicos"
  exit 1
fi

echo "==> Build app"
TELAR_RELEASE_FULL=1 "$ROOT/scripts/build-app.sh"

echo ""
echo "Release full listo. Packs clínicos embebidos en src/packs/."
