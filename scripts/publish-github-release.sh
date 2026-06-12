#!/usr/bin/env bash
# Publica dist/Telar-macos.zip (y opcionalmente el .exe) en GitHub Releases.
#
# Uso:
#   ./scripts/sign-macos-app.sh          # genera dist/Telar-macos.zip
#   ./scripts/publish-github-release.sh 0.1.0
#   ./scripts/publish-github-release.sh 0.1.0 --draft
#
# Requisitos: gh auth login, repo maren-keld/telarapp
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${GITHUB_REPO:-maren-keld/telarapp}"

VERSION="${1:-}"
shift || true
DRAFT_FLAG=()
for arg in "$@"; do
  if [[ "$arg" == "--draft" ]]; then
    DRAFT_FLAG=(--draft)
  fi
done

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').version" 2>/dev/null || python3 -c "import json; print(json.load(open('$ROOT/src-tauri/tauri.conf.json'))['version'])")"
fi

TAG="v${VERSION#v}"
ZIP="$ROOT/dist/Telar-macos.zip"
WIN_EXE="$ROOT/dist/Telar-windows.exe"

if [[ ! -f "$ZIP" ]]; then
  echo "Error: no existe $ZIP — ejecuta ./scripts/sign-macos-app.sh primero"
  exit 1
fi

ensure_gh() {
  if command -v gh >/dev/null 2>&1; then
    return
  fi
  local tools="$ROOT/.tools/gh"
  local gh_bin="$tools/bin/gh"
  if [[ -x "$gh_bin" ]]; then
    export PATH="$tools/bin:$PATH"
    return
  fi
  local arch os_tag
  arch="$(uname -m)"
  case "$arch" in
    arm64|aarch64) os_tag="macOS_arm64" ;;
    x86_64) os_tag="macOS_amd64" ;;
    *) echo "Error: arquitectura no soportada para instalar gh: $arch"; exit 1 ;;
  esac
  local ver="2.63.2"
  local zip="$ROOT/.tools/gh-${ver}.zip"
  mkdir -p "$ROOT/.tools"
  echo "→ Descargando GitHub CLI ($os_tag)…"
  curl -fsSL "https://github.com/cli/cli/releases/download/v${ver}/gh_${ver}_${os_tag}.zip" -o "$zip"
  rm -rf "$tools"
  unzip -q -o "$zip" -d "$ROOT/.tools"
  mv "$ROOT/.tools/gh_${ver}_${os_tag}" "$tools"
  rm -f "$zip"
  export PATH="$tools/bin:$PATH"
}

ensure_gh

if ! gh auth status >/dev/null 2>&1; then
  echo "→ GitHub CLI sin sesión. Abre el navegador para autorizar (una sola vez)…"
  gh auth login -h github.com -p https -w
fi

ASSETS=("$ZIP")
if [[ -f "$WIN_EXE" ]]; then
  ASSETS+=("$WIN_EXE")
fi

echo "→ Publicando release $TAG en $REPO"
echo "  Assets: ${ASSETS[*]}"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "→ Release $TAG ya existe; subiendo assets…"
  gh release upload "$TAG" "${ASSETS[@]}" --repo "$REPO" --clobber
else
  gh release create "$TAG" "${ASSETS[@]}" \
    --repo "$REPO" \
    --title "Telar $TAG" \
    --notes "Descarga Telar-macos.zip (macOS Apple Silicon) o Telar-windows.exe (Windows)." \
    "${DRAFT_FLAG[@]}"
fi

echo "✓ Release publicada: https://github.com/$REPO/releases/tag/$TAG"
echo ""
echo "Para auto-actualización en la app, configura el secreto TAURI_SIGNING_PRIVATE_KEY en GitHub"
echo "y publica también latest.json + bundles firmados para auto-actualización (TAURI_SIGNING_PRIVATE_KEY en GitHub Secrets)."
