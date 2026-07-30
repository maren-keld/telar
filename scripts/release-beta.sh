#!/usr/bin/env bash
# Release beta: bundle de packs → tag (dispara CI) → draft en GitHub con bundle.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
REPO="${GITHUB_REPO:-maren-keld/telar}"
GH_EMAIL="${GIT_AUTHOR_EMAIL:-47905566+maren-keld@users.noreply.github.com}"
GH_NAME="${GIT_AUTHOR_NAME:-maren-keld}"

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

echo "→ Tag $TAG (dispara CI)…"
GIT_COMMITTER_NAME="$GH_NAME" GIT_COMMITTER_EMAIL="$GH_EMAIL" \
  git -c user.name="$GH_NAME" -c user.email="$GH_EMAIL" \
  tag -a "$TAG" -m "Telar ${TAG}"
GIT_COMMITTER_NAME="$GH_NAME" GIT_COMMITTER_EMAIL="$GH_EMAIL" \
  git -c user.name="$GH_NAME" -c user.email="$GH_EMAIL" \
  push origin "$TAG"

echo "→ Release draft con bundle de packs…"
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$ROOT/dist/telar-packs-bundle.tar.gz" --repo "$REPO" --clobber
else
  gh release create "$TAG" "$ROOT/dist/telar-packs-bundle.tar.gz" \
    --repo "$REPO" \
    --draft \
    --title "Telar ${TAG}" \
    --notes "$NOTES"
fi

echo ""
echo "✓ CI Mac + Windows en curso"
echo "  Cuando CI termine:"
echo "    gh release edit $TAG --repo $REPO --draft=false --latest"
echo "  Release: https://github.com/$REPO/releases/tag/${TAG}"
