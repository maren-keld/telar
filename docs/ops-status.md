# Telar — ops status (para agentes)

Última actualización: **2026-09-14** · Mantener corto. El Coordinator del Project actualiza esto cuando cambia tip/branch de QA.

## Ahora

| Campo | Valor |
|:--|:--|
| **En desarrollo** | F-010 **FAIL-5** (Puntajes escapeHtml, sesiones, sidebar, C-SSRS, default Programa, scroll ejes, IA Estudio, Red de apoyo, plantillas custom) |
| **Branch de trabajo** | `cursor/f-010-qa-humano-fail-6068` (#350) — o branch FAIL-5 que salga de este tip |
| **Tip base canónico** | `64f654868d25ae7545b7f242a74ae04fef2f9f0c` (`64f6548`) |
| **PR** | https://github.com/maren-keld/telar/pull/350 |
| **App QA Humano** | Solo tras rebuild auth. Hasta entonces el tip de código es `64f6548`; no pisar `dist/` desde otro tip. |
| **Live** | `v0.2.0-beta.1` — **no tocar** |
| **Rebuild** | **NO** autorizado en este momento |

## Spec FAIL-5

Cursor Project store: `docs/fail-5-2026-09-14.md` (Context). Screens: `media/fail-5-2026-09-14/`.

## Regla anti-Codex overwrite

Si rebuildás, el commit de `.build-sha` **debe** ser el tip que compilaste. Nunca dejes `.build-sha` = tip A y el binario = tip B.
