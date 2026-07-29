#!/usr/bin/env bash
# Commit, push, build Mac local, tag y dispara release CI (Mac + Windows).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

echo "→ Versión: $VERSION ($TAG)"

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  git add -A
  git commit -m "$(cat <<EOF
Release ${TAG}: planes Free/Pro y consolidación Telar

Free: hasta 3 pacientes activos; el resto del consultorio funciona igual.
Pro (\$19.990/mes): pacientes ilimitados, exportación, neurofeedback completo y módulos.
Incluye landing/modules.html, script sync iCloud y repo en ~/Telar.
EOF
)"
fi

git push origin main

echo "→ Build macOS local…"
SIGN_MACOS=0 "$ROOT/scripts/build-app.sh"
"$ROOT/scripts/sign-macos-app.sh" "$ROOT/dist/Telar.app"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG ya existe — omitiendo push de tag"
else
  git tag -a "$TAG" -m "Telar ${TAG}"
  git push origin "$TAG"
  echo "→ Tag $TAG enviado — GitHub Actions construirá Mac + Windows"
fi

echo ""
echo "✓ Listo"
echo "  Local: dist/Telar.app, dist/Telar-macos.zip"
echo "  Release: https://github.com/maren-keld/telar/releases/tag/${TAG}"
