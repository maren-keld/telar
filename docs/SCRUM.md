# Telar — Backlog

**Stack:** Tauri 2 + Rust · HTML/CSS/JS · SQLite (SQLCipher) · Python sidecar · AGPL-3.0 · **macOS y Windows** (Linux sin BLE NF)

---

## Foco producto (2026 Q2–Q3)

**Telar para TDAH y trauma** — consultorio local, seguimiento longitudinal, neurofeedback opcional (Muse 2).

**Ya alineado con el foco:** DASS-21, GAD-7, EED, EFR, escalas subjetivas, genograma, objetivos, NF (atención Beta / relajación), notas, PDF programa.

**Fuera de foco hasta v1:** terapia roja, libros, badges/gamificación, red de psicólogos, Encuadro, dashboard noticias, add-ons.

**Dos agents — carriles sin pisarse:**

| Agente | Carril | Archivos típicos |
|--------|--------|------------------|
| **A — Clínica** | Escalas, plantillas, gráficos, diagnósticos | `src/js/modules/*.js`, `config.js`, `workspace-scores.js` |
| **B — Plataforma / NF** | `readable_text`, BLE Windows, export NF, tests | `readable-text.js`, `muse_ble.rs`, `neurofeedback.js`, `analyze_session.py`, `export-treatment-pdf.js` |

---

## En curso

_(vacío — ver Sprint 1 completado abajo)_

---

## Backlog — Foco TDAH + Trauma (más → menos importante)

### P0 — Fundación

| ID | Tarea | Agente | Notas |
|----|-------|--------|-------|
| DI-2 | Validar BLE Muse en Windows real | B | CI genera `.exe`; checklist en `docs/DI-2-WINDOWS-BLE.md`; falta prueba hardware |

### P1 — Instrumentos core

_(vacío)_

### P2 — Flujo clínico longitudinal

_(vacío)_

### P3 — Intervención diferenciada

_(vacío)_

### P4 — Producto y crecimiento

| ID | Tarea | Agente | Notas |
|----|-------|--------|-------|
| AI-1 | Asistente IA en dock + sidecar Ollama bajo demanda | B | Ajustes: local vs API; modelo descarga aparte; tras AI-2 |
| UX-10 | Firma del psicólogo (signature pad) | A | Informes PDF |
| MOD-1 | Ampliar catálogo módulos clínicos | A | Solo ítems alineados TDAH/trauma |

---

## Estacionado (fuera de foco v1)

| ID | Tarea | Motivo |
|----|-------|--------|
| MOD-2 | Terapia roja (red light therapy) | Fuera de vertical |
| MOD-3 | Libros | Fuera de vertical |
| CL-9 | Guía de apego | Útil; no core TDAH/trauma ahora |
| UX-11 | Palabras clave en perfil del psicólogo | Nice-to-have |
| UX-12 | Badges de logros | Gamificación; postergado |
| UX-13 | Dashboard noticias y badges | Postergado |
| INT-1 | Conexión Encuadro / scheduling | Post-v1 |
| INT-2 | Red de psicólogos | Post-v1 |
| INT-3 | Archbee → solución OSS | Post-v1 |
| INT-4 | Add-ons y complementos | Post-v1 |

---

## Hecho

| ID | Tarea |
|----|-------|
| S1.1 | Migraciones SQLite sin crash |
| S1.3 | Dev en Cursor (`./scripts/dev.sh`, Cmd+R) |
| S1.4 | Sidecar Python empaquetado (PyInstaller) |
| S1.5 | Selector de módulos en ficha |
| NF-1 | BLE nativo Rust (`btleplug`) |
| NF-2 | Audio NF con archivos locales |
| NF-3 | Reconexión y batería Muse en UI |
| NF-4 | Feedback en vivo alineado con post-análisis; banda Beta (13–30 Hz); 400 ms; Muse 2 only; macOS/Windows |
| CL-1 | DASS-21, EED, escalas subjetivas (ánimo/ansiedad 1–100) |
| CL-5 | GAD-7 — tamizaje ansiedad generalizada (7 ítems, 0–3) |
| CL-10 | ASRS v1.1 — tamizaje TDAH adulto (18 ítems, 0–4, scoring WHO Parte A) |
| CL-11 | PCL-5 — tamizaje TEPT DSM-5 (20 ítems, 0–4) |
| CL-7 | SPRINT-E-CL — trauma breve (validación Chile 27-F) |
| CL-12 | Gráficos ASRS / GAD-7 / PCL-5 / SPRINT / IES-R / A-DES en `workspace-scores.js` |
| CL-6 | IES-R — impacto de eventos (22 ítems, subescalas, ≥33) |
| CL-8 | A-DES Adolescente — disociación (30 ítems, 0–10, subescalas + A-DES-T) |
| CL-13 | Plantillas «TDAH adulto» y «Trauma + regulación» (`treatment-templates.js`) |
| CL-2 | Diagnósticos: campos estructurados TDAH/trauma + problemas preset |
| QA-1 | Smoke tests `scripts/qa-smoke.sh` (analyze_session + secure_db unit tests) |
| MARK-2 | Landing + pitch reposicionados TDAH/trauma Chile |
| CL-3 | Export CSV/PDF neurofeedback por sesión (tab Resultados) |
| CL-3b | PDF programa: bloque resumen psicométrico TDAH/trauma |
| NF-5 | Presets NF «Atención (TDAH)» vs «Relajación (trauma)» |
| MOD-4 | Estimulación bilateral visual (EMDR-adjacent) — timer, velocidad, notas |
| HANDOUT-1 | 3 módulos TCC piloto: ABC, Plan seguridad vital, Activación conductual |
| HANDOUT-2 | 8 módulos TCC restantes + buscador selector + menú Herramientas sidebar |
| AI-1a | Ajustes → Proveedor IA (local Ollama / API OpenAI-compatible) | UI + perfil; sidecar pendiente |
| AI-1b | Cliente IA + preset Mistral UE + prueba conexión | `ai-client.js`, `ai_api.rs`; default `mistral-small-latest` |
| TEL-1 | Ping anónimo de uso al abrir (1×/día, opt-out Ajustes, `/api/usage/ping`) |
| AI-2 | Exportar contexto del caso (markdown: `readable_text` + notas) |
| DATA-1 | `readable_text` en todos los módulos clínicos (`readable-text.js`) |
| UX-1 | Dark mode |
| UX-2/3 | Panel notas estilo Kindle + anotaciones + highlight |
| SEC-1 | SQLCipher AES-256 + Argon2id + Touch ID + PIN lockout |
| UX-4 | Ajustes UI workspace y estadísticas | Selector módulo, sidebar sesiones, +Nota, redes afiliación, exportar PDF |
| UX-5 | Genograma clínico redes de apoyo | Layout por generaciones, símbolos □/○, líneas unión y parentesco |
| DIST-2 | Backend suscripciones Mercado Pago | `server/app.py` + `subscription.js`; checkout 15.000 CLP/mes |
| CL-3a | Exportar programa de tratamiento PDF | Datos paciente, sesiones, módulos, NF (`export-treatment-pdf.js`) |
| UX-6 | Ajustes UI workspace, selector y biblioteca | Exportar flotante en sidebar, selector 900px, PDF módulos limpio, biblioteca ancho completo, botón NF 40px |
| UX-7 | Dark mode módulos clínicos | Inputs redes de apoyo, puntajes EED/DASS/EAR/EFR, cabecera reactivos sticky, EAR full width, Grabar NF |
| GOALS-1 | Pantalla Objetivos y convenios | Metas en tarjetas, CRUD convenios con contactos, tratamiento ↔ convenio, migración 009 |
| UX-8 | Dark mode y UX módulos | Puntajes panel, badge Tratamiento, En uso selector, alinear acciones módulo, editar custom |
| UX-14 | Idioma app (es/en) | Ajustes → Idioma; español por defecto; nav + ajustes + GAD-7 |
| UX-15 | IDs de pantalla + unlock centrado + orb visual NF | `#initialScreen`, `#patients`, `#statistics`, `#goals`, `#settings`, `#neurofeedback`; electrodos por protocolo; retro visual activa por defecto |
| UX-9 | EFR alerta, agenda, PDF | Alerta EFR respeta «Nunca»; sin +Añadir en checklists; agenda sin categorías vacías; abrir PDF al exportar |
| PRIV-1 | Exportar y borrar datos en Ajustes | CSV en Documentos; borrado total con confirmación + PIN; `db_wipe_all_data` |
| CL-4 | Respaldar base de datos en Ajustes | `db_backup_encrypted` → Documentos/Telar/respaldos |
| DIST-1 | API suscripciones Render | `render.yaml`, `subscription-config.js`, `scripts/deploy-subscription-api.sh`, CSP |
| DI-1 | Firma / notarización macOS | `scripts/sign-macos-app.sh`, `entitlements.plist`, `docs/DISTRIBUCION-MACOS.md` |
| DI-3 | GitHub Releases + auto-actualización | `publish-github-release.sh`, `.github/workflows/release.yml`, `tauri-plugin-updater`, UI unlock/ajustes |
| MARK-1 | Landing 1 página (marketing Chile) | `landing/` HTML estático, `docs/LANDING.md`, deploy Vercel/GitHub Pages |

---

## Deuda técnica

- i18n: ampliar traducción al inglés en módulos clínicos y agenda
- AI-1: sidecar Ollama + descarga bajo demanda del modelo elegido en Ajustes (no embebido en .app); dock asistente
- BLE: picker si hay varios Muse 2; validar Windows en hardware real (DI-2, ver `docs/DI-2-WINDOWS-BLE.md`)
- Linux NF: BLE postergado
- QA: ampliar cobertura más allá de `scripts/qa-smoke.sh` (QA-1 base hecho)

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-06-14 | **WORKFLOW:** `docs/WORKFLOW.md` unifica Cursor + Claude Code; `CLAUDE.md` y `.cursor/rules|skills` versionados; automations siguen locales |
| 2026-06-12 | **AI-1b:** preset Mistral UE por defecto; `ai-client.js` + `ai_chat_completion` (Rust); Ajustes con proveedor, modelo y «Probar conexión» |
| 2026-06-12 | Fix pantalla blanca al abrir: splash de carga, redirect unlock sin dejar `#app` vacío, import lazy modal IA |
| 2026-06-12 | UX workspace: `#rightsidebar` Notas/Perfil/Herramientas; cards notas restauradas; Ajustes con iconos SVG; «Analizar perfil con IA» |
| 2026-06-15 | **HANDOUT-0:** 11 handouts TCC en `src/assets/handouts/` (Telar, no Psi Lab); `manifest.json`, script `import-handouts-from-downloads.py`; prompt piloto `docs/HANDOUTS-PILOT-AGENT.md` |
| 2026-06-15 | **HANDOUT-1:** módulos `tcc_abc`, `tcc_plan_seguridad`, `tcc_activacion`; categoría TCC en selector; plantillas TDAH/trauma; §5.12 términos |
| 2026-06-15 | **LEGAL-AI:** T&C actualizados — nueva §6 Asistente IA (modos local/API, responsabilidades, limitación); §2 y §7 con excepciones; Política de Privacidad §3 reescrita con 3 tipos de transmisión; numeración §6→§12 actualizada |
| 2026-06-15 | **HANDOUT-2:** 8 módulos TCC (`tcc_socratico`…`tcc_estres`); buscador en selector; fix solapamiento «Crear módulo»; menú Herramientas + docs referencia (Pro) |
| 2026-06-15 | **AI-1a:** Ajustes → Asistente IA — modo local (Ollama/modelo aparte) vs API externa OpenAI-compatible; elección de modelo 3B–7B |
| 2026-06-14 | **CL-6 IES-R** + gráficos/resumen CL-12/CL-3b con IES; **CL-13** plantillas TDAH/trauma; **CL-2** diagnósticos estructurados; **QA-1** `scripts/qa-smoke.sh`; **MARK-2** landing/pitch vertical TDAH+trauma |
| 2026-06-14 | **CL-11 PCL-5 + CL-7 SPRINT-E-CL** módulos trauma; **CL-12** gráficos; **CL-3** export NF sesión; **CL-3b** resumen psicométrico PDF; **NF-5** presets; **AI-2** export contexto |
| 2026-06-12 | **CL-10 ASRS v1.1:** módulo `asrs.js` + scoring WHO Parte A; integrado en selector, PDF e i18n. **DATA-1:** `buildReadableText` para todos los módulos clínicos. **DI-2:** checklist Windows BLE en `docs/DI-2-WINDOWS-BLE.md` |
| 2026-06-14 | **Scope TDAH + trauma:** backlog repriorizado P0–P4; nuevos CL-10 (ASRS), CL-11 (PCL-5), CL-12 (gráficos), CL-13 (plantillas), CL-3b, NF-5, QA-1, MARK-2; carriles Agent A/B; estacionado MOD-2/3, UX-12/13, INT-* |
| 2026-05-31 | Backlog creado; P0 NF completado; UX dark mode y notas Kindle |
| 2026-06-05 | Licencia MIT → AGPL-3.0; SEC-1 marcado hecho; CL-4 backup UI y TEL-1 ping anónimo agregados |
| 2026-06-05 | Manual adaptado a estado actual: "app web" → "app de escritorio"; removidas referencias a servidor/link público/PDF; sección seguridad (Touch ID, PIN, SQLCipher); módulos Rosenberg, QOLS y FER documentados |
| 2026-06-06 | UX-4: selector módulo (botones, 850px, fuente 13px), estadísticas sección Tratamientos, redes afiliación, sidebar sesión, +Nota sobre IA, exportar PDF programa; backlog DIST-1 landing/suscripciones |
| 2026-06-06 | UX-5 genograma clínico; sidebar exportar abajo; selector/biblioteca 700px; DIST-2 API Mercado Pago (`server/`) |
| 2026-06-06 | NF-4: `nf-signal.js` filtros live (HP/notch/LP) + bandas Beta; post-análisis SMR→Beta; feedback 400 ms; Muse 2 only; docs macOS/Windows |
| 2026-06-06 | DIST-1: `render.yaml`, `/gracias` en API, `docs/SUSCRIPCIONES.md`, `subscription-config.js` — guía Opción B completa |
| 2026-06-09 | UX-6: sidebar exportar fijo abajo (texto centrado, nombre paciente 13px), selector módulo 900px, motivo «Reordenar texto con IA», grabar NF 40px, PDF sin notas y resúmenes de módulo corregidos, biblioteca módulos ancho completo |
| 2026-06-10 | UX-7 dark mode: inputs redes de apoyo, puntajes EED/DASS/EAR/EFR legibles, cabecera reactivos sticky, EAR full width, botón Grabar NF |
| 2026-06-10 | GOALS-1: pantalla Objetivos en sidebar, metas (convenios/pacientes/sesiones), entidad convenios con contactos, asociación en menú agenda |
| 2026-06-10 | Fix: cabecera modal convenio — botón cerrar alineado arriba a la derecha |
| 2026-06-10 | UX-8 dark mode puntajes/agenda/selector; alinear botones módulo; editar módulos custom; migración 010 limpia pacientes de prueba |
| 2026-06-10 | UX-9: EFR alerta oculta con «Nunca»; quitar +Añadir en Fortalezas/Defensas/Riesgos; agenda oculta categorías vacías; PDF se abre tras exportar |
| 2026-06-11 | Git inicializado; repo privado en GitHub; `.gitignore` reforzado (`.env`, sidecar, venv) |
| 2026-06-11 | GitHub: cuenta `maren-keld` (antes `felipeuppen`); actualizar `git remote` y conexión Render si aplica |
| 2026-06-11 | Automation #1 documentada: revisión SCRUM en PR (`docs/CURSOR-AUTOMATIONS.md`, borrador `.cursor/automations/scrum-pr-review.md`) |
| 2026-06-11 | Storytelling externo: README orientado a colegas clínicos; guía técnica en `docs/DESARROLLO.md`; manual actualizado (export PDF/CSV) |
| 2026-06-11 | Pitch 1 página (`docs/PITCH-1-PAGINA.md`); README rebalanceado macOS/Windows, repo = devs |
| 2026-06-12 | MARK-1: landing `landing/` (hero, funciones, planes, requisitos, instalación Mac, CTA demo); guía deploy Vercel + GitHub en `docs/LANDING.md` |
| 2026-06-09 | PRIV-1: Ajustes → Privacidad y datos — exportar CSV (pacientes, sesiones, NF, perfil) y eliminar todos los datos con triple confirmación |
| 2026-06-09 | CL-4 respaldo .enc.db; DIST-1 URL Render + deploy script + CSP; DI-1 sign-macos-app.sh y guía distribución |
| 2026-06-12 | DI-3: GitHub Releases (`Telar-macos.zip`, `Telar-windows.exe`), workflow CI, Tauri updater con toast + banner desbloqueo + Ajustes |
| 2026-06-12 | `.cursor/` fuera del repo público (`.gitignore`; archivos siguen en local para Cursor) |
| 2026-06-12 | Backlog: módulos (terapia roja, libros, estimulación bilateral), integraciones (Encuadro, red psicólogos, Archbee→OSS, add-ons), UX-10–13 (firma, keywords, badges, dashboard), escalas CL-5–9 (GAD-7, IES, SPRINT-E-CL, A-DES, guía de apego) |
| 2026-06-12 | **Rebrand:** Psicoterapia Lab → **Telar** (`cl.telarapp.desktop`, `Telar.app`, `telar.db`, dominio telarapp.cl, repo `maren-keld/telar`); migración legacy desde `cl.psicoterapialab.desktop` |
| 2026-06-12 | NF BLE: fix conexión colgada (WithoutResponse, race disconnect/reconnect), drenado EEG, evento muse-connected |
| 2026-06-12 | MARK-1: página `landing/neurofeedback.html` (guía NF + FAQ); enlace desde nav y tarjeta de funciones |
| 2026-06-12 | MARK-1: NF page — compra Muse 2 (manual), curso v2 Viña del Mar, placeholders fotos en `landing/assets/curso-nf-v2/` |
| 2026-06-12 | UX-15: IDs pantalla; NF orb visual; unlock centrado |
| 2026-06-13 | NF: desconectar BLE fiable; orb semáforo gradiente + campos magnéticos; %→0 al desconectar |
| 2026-06-13 | NF UX: botón Conectar primary; chevron ajustes a la derecha; orb azul idle desconectado; post-grabación desconecta Muse + tab Resultados; chips legibles en dark |
| 2026-06-13 | NF fix: cerrar stdin del sidecar Python tras enviar datos (análisis colgaba; sin resultados ni desconexión) |
| 2026-06-13 | NF fix: sidecar vía `--file` en caché + invoke `text_data`; tab Resultados al detener con loading |
| 2026-06-13 | NF: grabación decimada (~62 Hz) + timestamps; parse Python duplicados; toggle audio feedback; scroll al borrar módulo |
| 2026-06-13 | Fix invoke `textData` análisis NF; scroll centro al borrar módulo; selector módulo 800px |
| 2026-06-13 | DIST-2 fix checkout MP: suscripción vía `preapproval_plan` + `init_point` (POST `/preapproval` sin plan devolvía 500 en sandbox CL) |
| 2026-06-13 | UX suscripción: aviso explícito ventana privada + error MP «Una de las partes es de prueba» |
| 2026-06-13 | DIST-2: health `mp_sandbox_ready` — suscripciones TEST requieren token del vendedor test (no cuenta real como collector) |
| 2026-06-14 | DIST-2: `SUBSCRIPTION_DEV_BYPASS` — activar Pro local sin MP (`/api/subscriptions/dev-activate`) |
| 2026-06-14 | CL-8 A-DES Adolescente; MOD-4 estimulación bilateral; TEL-1 ping anónimo (opt-out Ajustes, `usage_ping.rs`, `/api/usage/ping`); plantilla trauma + A-DES/BLS |
| 2026-06-14 | UX NF: dark mode resultados/cards, toggle %/tiempo en cards, timer grabación, icono audio SVG; Likert PCL-5/IES-R; inputs dark BLS |
| 2026-06-14 | Fix scroll Ajustes (`min-height: 0` en `.app-content`) |
| 2026-06-14 | Fix congelamiento Ajustes: bucle `syncProFromServer` si plan local Pro y API inactiva; guard de render + sync sin downgrade en error de red |
| 2026-06-14 | Ajustes sync Pro: guard por ruta `#/settings`, downgrade solo si `active===false`, toast al revocar, `#settings` UX-15 |
