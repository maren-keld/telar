#!/usr/bin/env bash
# Firma y notariza Telar.app para distribución en otros Mac.
#
# Requisitos (Apple Developer Program, ~USD 99/año):
#   - Certificado "Developer ID Application" en el llavero
#   - Variables de entorno:
#       APPLE_DEVELOPER_ID="Developer ID Application: Tu Nombre (TEAMID)"
#       APPLE_ID=tu@email.com
#       APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
#       APPLE_TEAM_ID=TEAMID
#
# Uso:
#   ./scripts/sign-macos-app.sh
#   ./scripts/sign-macos-app.sh "dist/Telar.app"
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/dist/Telar.app}"
ENTITLEMENTS="$ROOT/src-tauri/entitlements.plist"

if [[ ! -d "$APP" ]]; then
  echo "Error: no existe $APP — ejecuta ./scripts/build-app.sh primero"
  exit 1
fi

xattr -cr "$APP"

resolve_identity() {
  if [[ -n "${APPLE_DEVELOPER_ID:-}" ]]; then
    echo "$APPLE_DEVELOPER_ID"
    return
  fi
  security find-identity -v -p codesigning 2>/dev/null \
    | awk -F'"' '/Developer ID Application/{print $2; exit}'
}

IDENTITY="$(resolve_identity || true)"

sign_binary() {
  local target="$1"
  [[ -f "$target" ]] || return 0
  if [[ -n "$IDENTITY" ]]; then
    codesign --force --options runtime --timestamp \
      --entitlements "$ENTITLEMENTS" \
      --sign "$IDENTITY" "$target"
  else
    codesign --force --sign - "$target"
  fi
}

echo "→ Firmando binarios internos…"
while IFS= read -r bin; do
  sign_binary "$bin"
done < <(find "$APP/Contents/MacOS" "$APP/Contents/Resources" -type f \( -perm -111 -o -name 'analyze_session*' \) 2>/dev/null || true)

echo "→ Firmando .app…"
if [[ -n "$IDENTITY" ]]; then
  codesign --force --deep --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$IDENTITY" "$APP"
else
  echo "⚠ Sin certificado Developer ID — firma ad-hoc (Gatekeeper seguirá avisando en otros Mac)"
  codesign --force --deep --sign - "$APP"
fi

codesign --verify --deep --strict --verbose=2 "$APP"

ZIP="$ROOT/dist/Telar-macos.zip"
echo "→ Creando ${ZIP}..."
ditto -c -k --keepParent "$APP" "$ZIP"

if [[ -n "$IDENTITY" && -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  echo "→ Enviando a notarización de Apple (puede tardar varios minutos)…"
  xcrun notarytool submit "$ZIP" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
  echo "→ Grapando ticket de notarización…"
  xcrun stapler staple "$APP"
  ditto -c -k --keepParent "$APP" "$ZIP"
  echo "✓ App firmada y notarizada: $APP"
  echo "  ZIP listo para compartir: $ZIP"
else
  cat <<EOF

✓ Firma local completada: $APP
  ZIP: $ZIP

Para que otro Mac abra sin advertencia de Gatekeeper necesitas:
  1. Apple Developer Program + certificado Developer ID Application
  2. Exportar las variables APPLE_* (ver cabecera de este script)
  3. Volver a ejecutar: ./scripts/sign-macos-app.sh

Mientras tanto, el receptor puede: clic derecho → Abrir (primera vez).
EOF
fi
