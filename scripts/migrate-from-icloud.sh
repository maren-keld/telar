#!/usr/bin/env bash
# Mueve Telar de iCloud Drive → ~/telar (carpeta local, git sano).
# Uso: bash scripts/migrate-from-icloud.sh
set -euo pipefail

ICLOUD="${TELAR_ICLOUD_ROOT:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Telar}"
LOCAL="$HOME/telar"
REPO="${TELAR_GITHUB_REPO:-https://github.com/maren-keld/telar.git}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/telar.icloud-backup-$STAMP"

RSYNC_EXCLUDES=(
  --exclude node_modules/
  --exclude dist/
  --exclude src-tauri/target/
  --exclude "src-tauri/target 2/"
  --exclude server/.venv/
  --exclude .git/
  --exclude .DS_Store
)

echo "==> Telar: iCloud → ~/telar"
echo "    Origen:  $ICLOUD"
echo "    Destino: $LOCAL"
echo ""

if [[ -L "$LOCAL" ]]; then
  echo "==> Quitando symlink ~/telar"
  rm "$LOCAL"
fi

if [[ -L "$HOME/Telar" ]]; then
  echo "==> Quitando symlink ~/Telar"
  rm "$HOME/Telar"
fi

if [[ -d "$LOCAL/.git" ]]; then
  echo "==> ~/telar ya existe con git — actualizando desde origin"
  git -C "$LOCAL" fetch origin
  git -C "$LOCAL" checkout main
  git -C "$LOCAL" pull --ff-only origin main
else
  if [[ -d "$LOCAL" ]]; then
    echo "==> Respaldo ~/telar → $BACKUP"
    mv "$LOCAL" "$BACKUP"
  fi
  echo "==> Clonando repo limpio…"
  git clone "$REPO" "$LOCAL"
fi

echo "==> Copiando packs clínicos y fuentes locales (gitignored)…"
for pack in clinical-shared tdah-adulto trauma-regulacion; do
  if [[ -d "$ICLOUD/src/packs/$pack" ]]; then
    mkdir -p "$LOCAL/src/packs"
    rsync -a "${RSYNC_EXCLUDES[@]}" "$ICLOUD/src/packs/$pack/" "$LOCAL/src/packs/$pack/"
  fi
done

if [[ -d "$ICLOUD/packs-src" ]]; then
  rsync -a "${RSYNC_EXCLUDES[@]}" "$ICLOUD/packs-src/" "$LOCAL/packs-src/"
fi

if [[ -d "$ICLOUD/packs" ]]; then
  rsync -a "${RSYNC_EXCLUDES[@]}" "$ICLOUD/packs/" "$LOCAL/packs/"
fi

if [[ ! -L "$HOME/Telar" && ! -e "$HOME/Telar" ]]; then
  ln -s "$LOCAL" "$HOME/Telar"
  echo "==> Atajo ~/Telar → ~/telar"
fi

echo "==> npm install…"
(cd "$LOCAL" && npm install)

echo ""
echo "✓ Migración lista"
echo "  Proyecto: $LOCAL"
echo "  Atajo:    ~/Telar → ~/telar"
[[ -d "$BACKUP" ]] && echo "  Backup:   $BACKUP"
echo ""
echo "Siguiente:"
echo "  1. Cursor → File → Open Folder → ~/telar"
echo "  2. cd ~/telar && npm run dev"
echo "  3. Cuando confirmes, podés archivar o borrar iCloud Drive/Telar"
echo "     (no borres hasta verificar que packs y NF funcionan)"
