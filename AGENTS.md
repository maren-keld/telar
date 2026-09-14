# Telar — instrucciones para agentes (Cursor, Codex, Claude, etc.)

Leé este archivo **y** `docs/ops-status.md` **antes** de editar, rebuild, merge o tocar `dist/`.

## Verdades fijas

1. **Kanban privado** vive en el Cursor Project (Context), no en GitHub Issues. Issues públicas en `maren-keld/telar` están **disabled** — no crear Issues.
2. **Live release actual:** `v0.2.0-beta.1`. No merge a `main`, no tag, no publish a Releases / latest **sin auth explícita de Felipe en ese turno**.
3. **Rebuild de `Telar.app`:** prohibido salvo que Felipe lo pida **explícitamente en ese turno**. No rebuildear “para probar”, no pisar `~/telar/dist/Telar.app` desde otra rama/tip.
4. **Tip QA Humano canónico** y branch activa: ver `docs/ops-status.md` (siempre actualizado). Si tu checkout no coincide con ese tip, **no** asumas que el binario local es válido.
5. **Pipeline:** QA → CTO → Programmer → QA → QA Humano → Deploy Ready → (auth) live. FAIL en QA Humano → hace falta detalle → En desarrollo.
6. **UI barata** → modelos baratos; no inventar merge/live por “dejar listo”.

## Rutas peligrosas

- `~/telar/dist/Telar.app` — binario de QA. No sobrescribir desde un tip distinto al canónico.
- `.build-sha` debe coincidir con el tip del app. Si no coincide, **parar** y reportar.
- Worktrees / ramas Codex paralelas: no copiar un build de una rama sobre el `dist/` de otra.

## Qué hacer al empezar

1. `git status` + `git rev-parse HEAD` + leer `docs/ops-status.md`.
2. Confirmar que estás en la **branch / tip** del status (o crear branch desde ese tip).
3. Si vas a rebuild: solo con auth explícita; si no hay auth → código + push, sin rebuild.
4. Commits: mensajes claros; no force-push a `main`.

## Qué no hacer

- No “arreglar” el app rebuildando desde `main` u otra rama random.
- No abrir Issues en GitHub.
- No mergear a live / Releases.
- No borrar worktrees ajenos ni el tip canónico de QA.

## Contexto de producto (corto)

Telar = app clínica Tauri (desktop). **Estudio de caso** = vista de ejes/elementos (no timeline de sesiones). Tickets y FAILS se rastrean en el Project kanban, no aquí. Este archivo son **reglas operativas**; el detalle de tickets está en Context o en specs bajo el store del Project.
