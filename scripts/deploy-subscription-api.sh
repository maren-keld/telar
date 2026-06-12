#!/usr/bin/env bash
# Verifica / prepara el despliegue de la API de suscripciones en Render.
#
# Opción A — Dashboard (recomendada la primera vez):
#   1. render.com → New → Blueprint → conecta github.com/maren-keld/telar
#   2. Pega MP_ACCESS_TOKEN (TEST-… para pruebas) cuando lo pida
#   3. Tras el deploy, ejecuta este script para verificar y actualizar la app
#
# Opción B — API (si tienes RENDER_API_KEY en el entorno):
#   export RENDER_API_KEY=rnd_...
#   ./scripts/deploy-subscription-api.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="telar-api"
DEFAULT_URL="https://${SERVICE_NAME}.onrender.com"
CONFIG_JS="$ROOT/src/js/subscription-config.js"

echo "→ URL esperada: $DEFAULT_URL"

health_ok() {
  curl -fsS -m 90 "${DEFAULT_URL}/api/health" | grep -q '"ok": true'
}

wait_for_health() {
  local i
  for i in $(seq 1 12); do
    if health_ok; then
      return 0
    fi
    echo "  … esperando API ($i/12, el plan free puede tardar ~30 s al despertar)"
    sleep 10
  done
  return 1
}

if [[ -n "${RENDER_API_KEY:-}" ]]; then
  echo "→ Buscando servicio en Render…"
  SERVICE_JSON="$(curl -fsS -m 30 \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services?limit=50")" || true
  if echo "$SERVICE_JSON" | grep -q "$SERVICE_NAME"; then
    echo "✓ Servicio $SERVICE_NAME encontrado en tu cuenta Render"
  else
    echo "⚠ No se encontró $SERVICE_NAME — crea el Blueprint desde el dashboard con render.yaml"
  fi
fi

echo "→ Comprobando /api/health…"
if wait_for_health; then
  curl -fsS "${DEFAULT_URL}/api/health" | python3 -m json.tool
else
  echo ""
  echo "La API aún no responde en $DEFAULT_URL"
  echo "Despliega con Render Blueprint (render.yaml en la raíz del repo) y vuelve a ejecutar este script."
  exit 1
fi

MP_OK="$(curl -fsS "${DEFAULT_URL}/api/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('mp_configured', False))")"
if [[ "$MP_OK" != "True" ]]; then
  echo ""
  echo "⚠ MP_ACCESS_TOKEN no configurado en Render → Environment"
  echo "  Pega tu token TEST- o APP_USR- de Mercado Pago Developers y redeploy."
  exit 1
fi

echo "→ Actualizando subscription-config.js…"
perl -i -pe "s|export const SUBSCRIPTION_API_PRODUCTION = '[^']*'|export const SUBSCRIPTION_API_PRODUCTION = '$DEFAULT_URL'|" "$CONFIG_JS"

echo "→ Probando checkout (email de prueba)…"
CHECKOUT="$(curl -fsS -m 60 -X POST "${DEFAULT_URL}/api/subscriptions/checkout" \
  -H 'Content-Type: application/json' \
  -d '{"email":"checkout-test@telarapp.cl"}')" || CHECKOUT=''

if echo "$CHECKOUT" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('checkout_url') else 1)" 2>/dev/null; then
  echo "✓ Checkout Mercado Pago OK (init_point recibido)"
else
  echo "⚠ Checkout falló — revisa MP_ACCESS_TOKEN en Render:"
  echo "$CHECKOUT" | python3 -m json.tool 2>/dev/null || echo "$CHECKOUT"
  exit 1
fi

echo ""
echo "✓ DIST-1 listo. Recompila la app:"
echo "  ./scripts/finish-iteration.sh && ./scripts/open-app.sh"
