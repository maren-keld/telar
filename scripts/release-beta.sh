#!/usr/bin/env bash
# Release beta: bundle de packs → draft en GitHub (crea tag) → CI Mac + Windows.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
REPO="${GITHUB_REPO:-maren-keld/telar}"

echo "→ Versión: $VERSION ($TAG)"

if git rev-parse "$TAG" >/dev/null 2>&1 || git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "Error: el tag $TAG ya existe. Sube la versión en package.json / tauri.conf.json / Cargo.toml / app-version.js"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: hay cambios sin commitear. Revisa git status y commitea antes de release."
  exit 1
fi

echo "→ Push main…"
git push origin main

echo "→ Empaquetando packs clínicos para CI…"
"$ROOT/scripts/pack-packs-for-ci.sh"

NOTES="$(cat <<EOF
## Telar ${TAG}

App completa con packs clínicos, neurofeedback Muse 2 y planes Free/Pro.

### Descargas
- **macOS (Apple Silicon):** \`Telar-macos.zip\`
- **Windows 10/11:** \`Telar-windows.exe\`

### Notas
- Datos 100 % locales y cifrados.
- Motor open source (AGPL): https://github.com/maren-keld/telar
EOF
)"

echo "→ Creando tag + release draft con bundle (dispara CI)…"
gh release create "$TAG" "$ROOT/dist/telar-packs-bundle.tar.gz" \
  --repo "$REPO" \
  --target main \
  --draft \
  --title "Telar ${TAG}" \
  --notes "$NOTES"

git fetch origin tag "$TAG" --no-tags 2>/dev/null || git fetch origin "refs/tags/${TAG}:refs/tags/${TAG}"

echo ""
echo "✓ Release draft creada con telar-packs-bundle.tar.gz — CI Mac + Windows en curso"
echo "  Cuando CI termine:"
echo "    gh release edit $TAG --repo $REPO --draft=false --latest"
echo "  Release: https://github.com/$REPO/releases/tag/${TAG}"
