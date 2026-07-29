#!/usr/bin/env bash
# Re-firma Telar.app con entitlements (Bluetooth, etc.) para desarrollo local.
# Sin esto, macOS bloquea btleplug aunque Bluetooth esté activo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/dist/Telar.app}"
ENTITLEMENTS="$ROOT/src-tauri/entitlements.plist"

if [[ ! -d "$APP" ]]; then
  echo "Error: no existe $APP"
  exit 1
fi

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "Error: no existe $ENTITLEMENTS"
  exit 1
fi

xattr -cr "$APP" 2>/dev/null || true

sign_binary() {
  local target="$1"
  [[ -f "$target" ]] || return 0
  codesign --force --sign - --entitlements "$ENTITLEMENTS" "$target"
}

while IFS= read -r bin; do
  sign_binary "$bin"
done < <(find "$APP/Contents/MacOS" "$APP/Contents/Frameworks" -type f \( -perm -111 -o -name '*.dylib' \) 2>/dev/null || true)

codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" "$APP"
codesign --verify --deep --strict "$APP"
echo "✓ Entitlements aplicados: $APP"
