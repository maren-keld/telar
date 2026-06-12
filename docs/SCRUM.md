# Telar — Backlog

**Stack:** Tauri 2 + Rust · HTML/CSS/JS · SQLite (SQLCipher) · Python sidecar · AGPL-3.0 · **macOS y Windows** (Linux sin BLE NF)

---

## En curso

| ID | Tarea | Notas |
|----|-------|-------|
| DATA-1 | `readable_text` en todos los módulos | `src/js/readable-text.js`; ampliar cobertura |

---

## Backlog (por prioridad)

### Clínica

| ID | Tarea |
|----|-------|
| CL-2 | Más módulos del mockup: diagnósticos, notas estructuradas |
| CL-3 | Exportar reportes CSV y PDF NF ampliado | PDF programa hecho; exportación global CSV en Ajustes; falta NF detallado por sesión |
| CL-5 | GAD-7 |
| CL-6 | Escala de impacto de evento (IES) |
| CL-7 | SPRINT-E-CL |
| CL-8 | A-DES Adolescente |
| CL-9 | Guía de apego |

### Módulos y tratamientos

| ID | Tarea |
|----|-------|
| MOD-1 | Ampliar catálogo de módulos clínicos |
| MOD-2 | Terapia roja (red light therapy) |
| MOD-3 | Libros |
| MOD-4 | Estimulación bilateral |

### Integraciones y plataforma

| ID | Tarea |
|----|-------|
| INT-1 | Conexión Encuadro u otra plataforma de scheduling |
| INT-2 | Red de psicólogos que usen la app |
| INT-3 | Migrar documentación de Archbee a solución open source |
| INT-4 | Add-ons y complementos |

### Perfil, dashboard y gamificación

| ID | Tarea |
|----|-------|
| UX-10 | Firma del psicólogo con signature pad |
| UX-11 | Palabras clave en perfil del psicólogo |
| UX-12 | Badges de logros (primer caso, 10 casos, etc.) |
| UX-13 | Dashboard: briefs de objetivos, stats, casos del día, tags, noticias y badges |

### IA

| ID | Tarea | Notas |
|----|-------|-------|
| AI-1 | Asistente IA (Claude) en dock derecho | Solo contexto del tratamiento, sin PII innecesaria |
| AI-2 | Exportar contexto del caso para IA | Anotaciones + comentarios + `readable_text` en un payload |

### Telemetría

| ID | Tarea | Notas |
|----|-------|-------|
| TEL-1 | Ping anónimo de uso al abrir la app | Servidor recibe → incrementa contador → descarta IP. Actualizar Privacy Policy. UI opt-out. |

### Distribución

| ID | Tarea | Notas |
|----|-------|-------|
| DI-2 | Validar BLE Muse en Windows real | CI genera `.exe`; falta prueba hardware |

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
| UX-9 | EFR alerta, agenda, PDF | Alerta EFR respeta «Nunca»; sin +Añadir en checklists; agenda sin categorías vacías; abrir PDF al exportar |
| PRIV-1 | Exportar y borrar datos en Ajustes | CSV en Documentos; borrado total con confirmación + PIN; `db_wipe_all_data` |
| CL-4 | Respaldar base de datos en Ajustes | `db_backup_encrypted` → Documentos/Telar/respaldos |
| DIST-1 | API suscripciones Render | `render.yaml`, `subscription-config.js`, `scripts/deploy-subscription-api.sh`, CSP |
| DI-1 | Firma / notarización macOS | `scripts/sign-macos-app.sh`, `entitlements.plist`, `docs/DISTRIBUCION-MACOS.md` |
| DI-3 | GitHub Releases + auto-actualización | `publish-github-release.sh`, `.github/workflows/release.yml`, `tauri-plugin-updater`, UI unlock/ajustes |
| MARK-1 | Landing 1 página (marketing Chile) | `landing/` HTML estático, `docs/LANDING.md`, deploy Vercel/GitHub Pages |

---

## Deuda técnica

- Bundle ID: `cl.telarapp.desktop`
- Permisos sidecar: validar ACL Tauri 2 en release
- Audio NF: reemplazar tonos placeholder por MP3/WAV finales
- BLE: picker si hay varios Muse 2; validar Windows en hardware real
- Linux NF: BLE postergado

---

## Changelog

| Fecha | Cambio |
|-------|--------|
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
| 2026-06-12 | **Rebrand:** Psicoterapia Lab → **Telar** (`cl.telarapp.desktop`, `Telar.app`, `telar.db`, dominio telarapp.cl, repo `maren-keld/telarapp`); migración legacy desde `cl.psicoterapialab.desktop` |
