#!/usr/bin/env bash
# CI / pre-publicación: verifica que no haya contenido clínico propietario en paths públicos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

echo "==> Verificando .gitignore incluye packs propietarios"
for pattern in 'packs/' 'packs-private/' 'src/packs/clinical-shared' 'src/packs/tdah-adulto' 'src/packs/trauma-regulacion'; do
  if ! grep -qF "$pattern" .gitignore 2>/dev/null; then
    echo "FAIL: falta en .gitignore: $pattern"
    FAIL=1
  fi
done

echo "==> Verificando packs/ no está en índice git"
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git ls-files --error-unmatch packs/ >/dev/null 2>&1; then
    echo "FAIL: packs/ está trackeado en git"
    FAIL=1
  fi
  for p in src/packs/clinical-shared src/packs/tdah-adulto src/packs/trauma-regulacion; do
    if git ls-files "$p" 2>/dev/null | grep -q .; then
      echo "FAIL: contenido propietario trackeado: $p"
      FAIL=1
    fi
  done
fi

echo "==> Verificando handouts clínicos no en src/assets/handouts (repo público)"
CLINICAL_HANDOUTS=(
  asrs pcl5 iesr sprint
  plan-seguridad activacion-conductual flexibilidad
)
for h in "${CLINICAL_HANDOUTS[@]}"; do
  if compgen -G "src/assets/handouts/*${h}*" >/dev/null 2>&1; then
    echo "WARN: handout clínico aún en src/assets/handouts: *${h}*"
    echo "      Ejecutar prepare-public-repo para limpiar antes de publicar."
  fi
done

echo "==> Verificando stub demo presente"
if [[ ! -f src/packs/demo/pack.json ]]; then
  echo "FAIL: falta src/packs/demo/pack.json"
  FAIL=1
fi

echo "==> Verificando index público"
if [[ ! -f src/packs/index.public.json ]]; then
  echo "FAIL: falta src/packs/index.public.json"
  FAIL=1
fi

echo "==> Verificando motor público sin NF / suscripciones / backend Pro"
PUBLIC_FORBIDDEN=(
  src/js/modules/neurofeedback.js
  server/app.py
  src-tauri/src/muse_ble.rs
  src-tauri/src/subscription_api.rs
  landing/neurofeedback.html
  render.yaml
)
for f in "${PUBLIC_FORBIDDEN[@]}"; do
  if [[ -f "$f" ]]; then
    echo "FAIL: archivo no debe estar en repo público: $f"
    echo "      Ejecuta ./scripts/strip-clinical-for-public.sh"
    FAIL=1
  fi
done

if [[ -f src/js/subscription-config.js ]] && grep -q 'onrender.com' src/js/subscription-config.js 2>/dev/null; then
  echo "FAIL: subscription-config.js expone URL de API de producción"
  FAIL=1
fi

if [[ -f src/js/subscription.js ]] && ! grep -q 'Stub repo público' src/js/subscription.js 2>/dev/null; then
  echo "FAIL: subscription.js debe ser stub en repo público"
  FAIL=1
fi

if [[ -f src/js/components/subscribe-pro-modal.js ]] && grep -q 'mercadopago' src/js/components/subscribe-pro-modal.js 2>/dev/null; then
  echo "FAIL: subscribe-pro-modal.js completo en repo público (debe ser stub)"
  FAIL=1
fi

if [[ -f src/js/components/subscribe-pro-modal.js ]] && ! grep -q 'Stub repo público' src/js/components/subscribe-pro-modal.js 2>/dev/null; then
  echo "FAIL: subscribe-pro-modal.js debe ser stub en repo público"
  FAIL=1
fi

if [[ -f src-tauri/src/lib.rs ]] && grep -qE 'mod (muse_ble|subscription_api|usage_ping)|analyze_neurofeedback_session|muse_ble::|subscription_api::|usage_ping::|run_sidecar|resolve_python_(binary|script)' src-tauri/src/lib.rs 2>/dev/null; then
  echo "FAIL: lib.rs aún referencia neurofeedback, BLE Muse o suscripciones"
  echo "      Ejecuta ./scripts/strip-clinical-for-public.sh"
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "prepare-public-repo: FALLÓ"
  exit 1
fi

echo ""
echo "prepare-public-repo: OK"
