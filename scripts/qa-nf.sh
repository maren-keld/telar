#!/usr/bin/env bash
# QA NF-01 … NF-10 — comprobaciones estáticas + smoke analyze_session.
# Manual con Muse: conectar, línea base ojos abiertos, grabar, resultados.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0
FAIL=0

ok() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

grep_file() {
  grep -q "$2" "$1" 2>/dev/null
}

echo "→ QA NF-01 … NF-10 (código)"

# NF-01: grabación con timestamps de paquete
if grep_file src/lib/nf-session.js 'timestampMs' \
  && grep_file src/lib/nf-bands.js 'NF_SAMPLE_RATE = 256'; then
  ok "NF-01 grabación filtrada ~256 Hz (timestamps de paquete)"
else
  bad "NF-01 grabación filtrada ~256 Hz"
fi

# NF-02: FFT 256 (1 s) para menor latencia del orbe
if grep_file src/lib/nf-bands.js 'NF_LIVE_FFT_SIZE = 256' \
  && grep_file src/lib/nf-bands.js 'NF_LIVE_WINDOW_SEC = 1'; then
  ok "NF-02 ventana espectral 1 s (FFT 256)"
else
  bad "NF-02 ventana espectral 1 s (FFT 256)"
fi

# NF-03: sin atenuación HF solo en vivo
if ! grep -q 'attenuateHighFrequency' src/lib/nf-signal.js 2>/dev/null; then
  ok "NF-03 sin atenuación HF extra en vivo"
else
  bad "NF-03 sin atenuación HF extra en vivo"
fi

# NF-04: Python no re-filtra si fs alto
if grep_file python/analyze_session.py 'PRE_FILTERED_MIN_FS' \
  && grep_file python/analyze_session.py 'fs >= PRE_FILTERED_MIN_FS'; then
  ok "NF-04 Python skip doble filtrado (fs ≥ umbral)"
else
  bad "NF-04 Python skip doble filtrado"
fi

# NF-05: constantes de suavizado
if grep_file src/lib/nf-bands.js 'NF_BAR_SMOOTH_ALPHA' \
  && grep_file src/lib/nf-bands.js 'NF_ORB_SMOOTH' \
  && grep_file src/lib/nf-bands.js 'NF_AUDIO_SMOOTH'; then
  ok "NF-05 constantes de latencia/suavizado"
else
  bad "NF-05 constantes de latencia/suavizado"
fi

# NF-06: artefactos + EMG
if grep_file src/lib/nf-signal.js 'detectArtifact' \
  && grep_file src/lib/nf-bands.js 'NF_EMG_BETA_PCT' \
  && grep_file src/js/modules/neurofeedback.js 'artifactKind === .emg'; then
  ok "NF-06/15 detección artefactos + EMG"
else
  bad "NF-06/15 detección artefactos + EMG"
fi

# NF-17: referencia por lote al cerrar línea base (no warmup EMA)
if grep_file src/lib/nf-session.js 'feedbackEma.freeze' \
  && grep_file src/lib/nf-signal.js 'class BatchZ' \
  && ! grep_file src/lib/nf-session.js '_warmupStartedAt'; then
  ok "NF-17 freeze por lote al completar línea base"
else
  bad "NF-17 freeze por lote al completar línea base"
fi

# NF-18: warmup huérfano eliminado; orbe adaptativo separado de la medición
if ! grep_file src/lib/nf-config.js 'NF_WARMUP' \
  && ! grep_file src/js/modules/neurofeedback.js 'nf-warmup-sec' \
  && grep_file src/lib/nf-signal.js 'class AdaptiveShaper'; then
  ok "NF-18 sin warmup; shaping adaptativo en el orbe"
else
  bad "NF-18 warmup eliminado / AdaptiveShaper"
fi

# NF-16: semáforo calidad señal
if grep_file src/lib/nf-session.js '_updateSignalQuality' \
  && grep_file src/js/modules/neurofeedback.js 'nf-signal-quality'; then
  ok "NF-16 indicador calidad señal"
else
  bad "NF-16 indicador calidad señal"
fi

# NF-08: setProtocol no resetea EMA
if sed -n '/setProtocol(p)/,/^  }/p' src/lib/nf-session.js | grep -q 'feedbackEma.reset'; then
  bad "NF-08 setProtocol no debe resetear EMA"
else
  ok "NF-08 cambio protocolo no resetea EMA"
fi

# NF-09: tarjeta entrenada + prioridad en resultados
if grep_file src/js/modules/nf-results.js 'nf-state-card--trained' \
  && grep_file src/js/modules/nf-results.js 'nf-state-card--reference' \
  && grep_file src/css/modules.css 'nf-state-card__role'; then
  ok "NF-19 resultados: métrica entrenada primero"
else
  bad "NF-19 layout resultados"
fi

# NF-10: ayuda
if grep_file src/lib/nf-bands.js 'ojos abiertos' \
  && grep_file src/js/modules/neurofeedback.js 'ojos abiertos' \
  && grep_file src/js/modules/neurofeedback.js 'parpad'; then
  ok "NF-10 copy de ayuda (ojos abiertos / artefactos)"
else
  bad "NF-10 copy de ayuda"
fi

# Sprint 2 — NF-11 baseline
if grep_file src/lib/nf-session.js "startBaseline" \
  && grep_file src/lib/nf-session.js 'completeBaseline' \
  && grep_file src/js/modules/neurofeedback.js 'nf-start-baseline'; then
  ok "NF-11 baseline explícito pre-entrenamiento"
else
  bad "NF-11 baseline explícito"
fi

# NF-13 ventanas Python 2 s
if grep_file python/analyze_session.py 'WINDOW_SEC = 2.0' \
  && grep_file python/analyze_session.py 'STEP_SEC = 1.0'; then
  ok "NF-13 ventanas post 2 s / paso 1 s"
else
  bad "NF-13 ventanas Python"
fi

# NF-14 gráfico correlación
if grep_file src/js/modules/nf-results.js 'nf-live-chart' \
  && grep_file src/lib/nf-session.js '_liveTrace'; then
  ok "NF-14 gráfico vivo vs post"
else
  bad "NF-14 gráfico correlación"
fi

# Sprint 3 — NF-12 Welch en vivo
if grep_file src/lib/nf-signal.js 'welchBandPowers' \
  && grep_file src/lib/nf-session.js 'welchBandPowers'; then
  ok "NF-12 Welch en vivo"
else
  bad "NF-12 Welch en vivo"
fi

# Sprint 4 — informe PDF PSD (espectral en pantalla es opcional)
if grep_file src/js/modules/nf-results.js 'nf-evolution-chart' \
  && grep_file src/js/export-nf-session.js 'drawPsdBars'; then
  ok "NF-20/21/22 evolución + PDF PSD"
else
  bad "NF-20/21/22 informe clínico"
fi

if grep_file src/js/modules/neurofeedback.js 'topomap\|topomapa'; then
  bad "NF-23 topomapa debe estar omitido"
else
  ok "NF-23 topomapa omitido"
fi

echo ""
echo "→ QA NF: analyze_session (smoke)"
if "$ROOT/scripts/qa-smoke.sh" >/dev/null 2>&1; then
  ok "qa-smoke.sh"
else
  bad "qa-smoke.sh falló"
fi

if npm run test:frontend >/dev/null 2>&1; then
  ok "grabaciones determinísticas JS"
else
  bad "grabaciones determinísticas JS"
fi

if python3 -m unittest discover -s python/tests >/dev/null 2>&1; then
  ok "grabaciones determinísticas Python"
else
  bad "grabaciones determinísticas Python"
fi

echo ""
echo "Resultado NF QA: ${PASS} ok, ${FAIL} fallos"
if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "Manual (Muse): conectar → línea base ojos abiertos (orbe quieto) → grabar → detener → resultados."
fi
[ "$FAIL" -eq 0 ]
