#!/usr/bin/env bash
# Descarga la base GeoIP usada para resolver la comuna del visitante.
#
# DB-IP City Lite — licencia CC BY 4.0, sin cuenta ni API key. Se publica una
# versión nueva cada mes; si la del mes actual todavía no está, se usa la del
# mes anterior.
#
# El archivo NO va en git (pesa ~60 MB y la licencia pide atribución en el
# sitio, no redistribución dentro del repo). Se baja en cada build de Render.
#
# La API funciona sin este archivo: geo_event() devuelve None y el panel
# muestra la sección de comuna apagada.
set -euo pipefail

DEST="${GEOIP_DB_PATH:-$(dirname "$0")/geoip/dbip-city-lite.mmdb}"
mkdir -p "$(dirname "$DEST")"

try_month() {
  local month="$1"
  local url="https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz"
  echo "GeoIP: intentando ${url}"
  curl -fsSL --max-time 180 "$url" | gunzip > "$DEST"
}

if try_month "$(date -u +%Y-%m)"; then
  echo "GeoIP: instalada la base del mes en curso."
elif try_month "$(date -u -d '1 month ago' +%Y-%m 2>/dev/null || date -u -v-1m +%Y-%m)"; then
  echo "GeoIP: la del mes en curso no está publicada; se usó la del mes anterior."
else
  # Sin base, la analítica de comuna queda apagada — no es motivo para tumbar
  # el despliegue de la API de suscripciones.
  echo "GeoIP: no se pudo descargar. El panel mostrará la comuna apagada." >&2
  rm -f "$DEST"
fi
