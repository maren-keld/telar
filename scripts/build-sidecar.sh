#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="$(uname -m)"
OS="$(uname -s)"
TRIPLE=""
OUT_NAME="analyze_session"

case "${OS}-${ARCH}" in
  Darwin-arm64) TRIPLE="aarch64-apple-darwin" ;;
  Darwin-x86_64) TRIPLE="x86_64-apple-darwin" ;;
  Linux-x86_64) TRIPLE="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64) TRIPLE="aarch64-unknown-linux-gnu" ;;
  MINGW*|MSYS*) TRIPLE="x86_64-pc-windows-msvc"; OUT_NAME="analyze_session.exe" ;;
  *) echo "Plataforma no soportada: ${OS}-${ARCH}"; exit 1 ;;
esac

BIN_DIR="$ROOT/src-tauri/binaries"
mkdir -p "$BIN_DIR"
TARGET="$BIN_DIR/analyze_session-${TRIPLE}"

echo "→ Compilando sidecar Python para ${TRIPLE}…"
python3 -m PyInstaller \
  --onefile \
  --clean \
  --noconfirm \
  --name "analyze_session-${TRIPLE}" \
  --distpath "$BIN_DIR" \
  --workpath "$ROOT/build/pyinstaller-work" \
  --specpath "$ROOT/build/pyinstaller-spec" \
  "$ROOT/python/analyze_session.py"

if [[ -f "$BIN_DIR/analyze_session-${TRIPLE}" ]]; then
  chmod +x "$BIN_DIR/analyze_session-${TRIPLE}"
  echo "✓ Sidecar: $BIN_DIR/analyze_session-${TRIPLE}"
else
  echo "Error: no se generó el binario esperado"
  exit 1
fi
