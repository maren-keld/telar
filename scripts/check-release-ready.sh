#!/usr/bin/env bash
# Verifica que main pueda producir un release, sin compilar nada.
#
# Existe porque scripts/build-sidecar.sh estuvo borrado de main cinco dias sin
# que nada avisara: el release de beta.7 se habia tageado desde otra rama, asi
# que el dano solo aparecio al intentar publicar beta.8. Correr esto en CI
# convierte ese fallo en un aviso el mismo dia que se rompe.
#
# Uso: ./scripts/check-release-ready.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
# En GitHub Actions los errores salen como anotaciones; en local, como texto.
err() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::error::$1"; else echo "  ✗ $1"; fi
  FAIL=1
}
ok() { echo "  ✓ $1"; }

echo "→ Scripts que invoca .github/workflows/release.yml"
for s in $(grep -oE '\./scripts/[a-z0-9-]+\.sh' .github/workflows/release.yml | sort -u); do
  if [[ ! -f "$s" ]]; then
    err "$s lo invoca el release y no existe en el repo"
  elif ! bash -n "$s" 2>/dev/null; then
    err "$s tiene un error de sintaxis"
  else
    ok "$s"
  fi
done

echo "→ Insumos del build"
[[ -f python/analyze_session.py ]] \
  && ok "python/analyze_session.py (sidecar)" \
  || err "falta python/analyze_session.py — build-sidecar.sh no tiene que compilar"

if [[ -f scripts/clinical-packs.txt ]]; then
  N=$(grep -cvE '^\s*(#|$)' scripts/clinical-packs.txt || true)
  [[ "$N" -gt 0 ]] \
    && ok "scripts/clinical-packs.txt ($N packs)" \
    || err "scripts/clinical-packs.txt no lista ningun pack"
else
  err "falta scripts/clinical-packs.txt — las tres etapas del release lo leen"
fi

echo "→ Versiones alineadas"
V_PKG=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' package.json | head -1)
V_TAURI=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' src-tauri/tauri.conf.json | head -1)
V_CARGO=$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)
V_JS=$(sed -n "s/.*APP_VERSION = '\(.*\)'.*/\1/p" src/js/app-version.js | head -1)
if [[ "$V_PKG" == "$V_TAURI" && "$V_PKG" == "$V_CARGO" && "$V_PKG" == "$V_JS" ]]; then
  ok "todas en $V_PKG"
else
  err "desalineadas — package.json=$V_PKG tauri.conf.json=$V_TAURI Cargo.toml=$V_CARGO app-version.js=$V_JS"
fi

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "✓ main puede producir un release."
else
  echo "✗ main NO puede producir un release. Arregla lo de arriba antes de tagear."
fi
exit "$FAIL"
