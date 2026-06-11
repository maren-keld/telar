#!/usr/bin/env bash
# Invocado por beforeBuildCommand en tauri.conf.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
# Formato tipo Finder: wed 3 jun 12:05 (hora local)
STAMP_LABEL="$(date "+%a %e %b %H:%M" | tr '[:upper:]' '[:lower:]' | sed 's/  / /g;s/^ //')"
cat > "$ROOT/src/js/build-info.js" <<EOF
/** Generado en build — no editar a mano */
export const BUILD_STAMP_ISO = '${STAMP_ISO}';
export const BUILD_STAMP_LABEL = '${STAMP_LABEL}';
/** @deprecated Usar BUILD_STAMP_LABEL */
export const BUILD_STAMP = BUILD_STAMP_LABEL;
EOF
