#!/usr/bin/env bash
# QA-1 — smoke tests mínimos (sin framework).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0
FAIL=0

ok() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo "→ QA-1: analyze_session.py"
SAMPLE=""
TS="2020-06-01T12:00:00"
for i in $(seq 1 512); do
  v=$((100 + (i % 50)))
  SAMPLE+="${TS},${v},$((v+10)),$((v+20)),$((v+5))@"
done
SAMPLE="${SAMPLE%@}"
OUT=$(printf '%s' "$SAMPLE" | python3 python/analyze_session.py 2>/dev/null || true)
if echo "$OUT" | grep -qE '^[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?$'; then
  ok "stdin → CSV 7 campos numéricos"
else
  bad "stdin → salida inválida: ${OUT:-vacío}"
fi

TMP=$(mktemp)
printf '%s' "$SAMPLE" > "$TMP"
OUT2=$(python3 python/analyze_session.py --file "$TMP" 2>/dev/null || true)
rm -f "$TMP"
if echo "$OUT2" | grep -qE '^[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?,[0-9]+(\.[0-9]+)?$'; then
  ok "--file → CSV 7 campos numéricos"
else
  bad "--file → salida inválida: ${OUT2:-vacío}"
fi

EMPTY=$(printf '' | python3 python/analyze_session.py 2>/dev/null || true)
if [ "$EMPTY" = "0,0,0,0,0,0,0" ]; then
  ok "entrada vacía → ceros"
else
  bad "entrada vacía → esperado 0,0,0,0,0,0,0 got ${EMPTY:-vacío}"
fi

echo "→ QA-1: Rust unit tests (secure_db)"
if (cd src-tauri && cargo test --lib secure_db::tests --quiet 2>/dev/null); then
  ok "cargo test secure_db::tests"
else
  bad "cargo test secure_db::tests falló"
fi

echo ""
echo "Resultado: ${PASS} ok, ${FAIL} fallos"
[ "$FAIL" -eq 0 ]
