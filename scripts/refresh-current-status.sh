#!/usr/bin/env bash
# Refresca el bloque GIT de docs/current-status.md. Conserva el bloque HUMAN.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATUS="$ROOT/docs/current-status.md"
mkdir -p "$ROOT/docs"

if [[ ! -f "$STATUS" ]]; then
  cat > "$STATUS" <<'EOF'
# Telar — current status (WIP local)

Grok Bot / Cursor: este archivo es el rastro de **en qué andamos ahora**.
No está en git (`docs/` está gitignored).

<!-- HUMAN -->
## En qué andamos

_(vacío)_
<!-- /HUMAN -->

<!-- GIT -->
<!-- /GIT -->
EOF
fi

SNAP="$(mktemp)"
{
  echo "**Generado:** $(date '+%Y-%m-%d %H:%M %Z')"
  echo "**Rama:** \`$(git -C "$ROOT" branch --show-current)\`"
  echo "**HEAD:** \`$(git -C "$ROOT" log -1 --oneline)\`"
  echo
  echo '```'
  git -C "$ROOT" status -sb
  echo '```'
  echo
  echo '### Diff --stat (tracked)'
  echo
  echo '```'
  git -C "$ROOT" diff --stat HEAD
  echo '```'
} > "$SNAP"

python3 - "$STATUS" "$SNAP" <<'PY'
import pathlib, sys
status, snap = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]).read_text()
text = status.read_text()
start, end = "<!-- GIT -->", "<!-- /GIT -->"
i, j = text.find(start), text.find(end)
if i < 0 or j < 0 or j < i:
    raise SystemExit("docs/current-status.md: faltan marcadores <!-- GIT --> / <!-- /GIT -->")
status.write_text(text[: i + len(start)] + "\n" + snap.rstrip() + "\n" + text[j:])
PY

rm -f "$SNAP"
echo "Actualizado $STATUS"
