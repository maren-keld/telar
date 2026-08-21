#!/usr/bin/env bash
# Release Telar: tag en main → CI Mac + Windows.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: ejecuta desde la rama main. Actual: $BRANCH"
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
REPO="${GITHUB_REPO:-maren-keld/telar}"

echo "→ Versión: $VERSION ($TAG) · rama main"

if git rev-parse "$TAG" >/dev/null 2>&1 || git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "Error: el tag $TAG ya existe."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: hay cambios sin commitear."
  exit 1
fi

echo "→ Empaquetando packs clínicos para CI…"
"$ROOT/scripts/pack-packs-for-ci.sh"

echo "→ Push main…"
git push origin main

NOTES="$(cat <<EOF
## Telar ${TAG}

App completa con packs clínicos, neurofeedback Muse 2, IA opcional con consentimiento y planes Demo/Pro.

### Descargas
- **macOS (Apple Silicon):** \`Telar-macos.zip\`
- **Windows 10/11:** \`Telar-windows.exe\`

### Notas
- Datos clínicos cifrados localmente.
- IA desactivada por defecto; API externa requiere consentimiento explícito.
EOF
)"

# Draft + packs ANTES de que exista el tag en origin. Si se pushea el tag
# primero, CI arranca sin bundle y Windows puede quedarse en tauri-action
# creando el release a la vez que este script.
echo "→ Release draft $TAG con bundle de packs (el tag dispara CI)…"
gh release create "$TAG" "$ROOT/dist/telar-packs-bundle.tar.gz" \
  --repo "$REPO" \
  --draft \
  --target "$(git rev-parse HEAD)" \
  --title "Telar ${TAG}" \
  --notes "$NOTES"

git fetch origin "refs/tags/${TAG}:refs/tags/${TAG}" 2>/dev/null || true

echo ""
echo "✓ CI Mac + Windows en curso"
echo "  Cuando CI termine:"
echo "    gh release edit $TAG --repo $REPO --draft=false --latest"
echo "  Release: https://github.com/$REPO/releases/tag/${TAG}"
