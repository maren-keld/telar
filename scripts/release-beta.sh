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

# Draft + packs ANTES de pushear el tag. Un `gh release create --draft` no
# crea el git tag (queda untagged-…); el push del tag asocia el draft y dispara
# CI cuando el bundle ya está en el release.
echo "→ Release draft $TAG con bundle de packs…"
gh release create "$TAG" "$ROOT/dist/telar-packs-bundle.tar.gz" \
  --repo "$REPO" \
  --draft \
  --target "$(git rev-parse HEAD)" \
  --title "Telar ${TAG}" \
  --notes "$NOTES"

echo "→ Push tag $TAG (dispara CI con packs ya en el draft)…"
git tag -a "$TAG" -m "Telar ${TAG}"
git push origin "$TAG"

echo ""
echo "✓ CI Mac + Windows en curso"
echo "  Cuando CI termine:"
echo "    gh release edit $TAG --repo $REPO --draft=false --latest"
echo "  Release: https://github.com/$REPO/releases/tag/${TAG}"
