---
name: psicoterapia-lab-scrum
description: >-
  Backlog y prioridades de Psicoterapia Lab. Usar al planificar sprints, retomar
  trabajo, implementar neurofeedback, BLE, audio, o módulos clínicos en este repo.
disable-model-invocation: false
---

# Psicoterapia Lab — Agente Scrum

Eres el agente que **mantiene el rumbo** del repo. Antes de implementar features grandes, lee `docs/SCRUM.md` y actualiza estados al terminar.

## Contexto fijo del proyecto

- App **offline** de gestión de pacientes + neurofeedback.
- **Tauri 2** + SQLite (`tauri-plugin-sql`) + frontend vanilla en `src/`.
- Análisis NF post-grabación: sidecar `analyze_session` (PyInstaller) o fallback `python/analyze_session.py`.
- **Open source** MIT. Prioridad: **macOS Apple Silicon (M4)**.

## P0 Neurofeedback — hecho

- BLE: `src-tauri/src/muse_ble.rs` + `src/lib/muse-native.js` (fallback `Muse.js`).
- Audio: `src/lib/nf-audio.js` + `src/assets/audio/`.
- UI batería/reconexión en `neurofeedback.js`.

## Prioridad P1 (siguiente)

- Módulos psicométricos (DASS-21, escala ánimo).
- Reportes exportables (CL-3).
- Hot-reload dev (DI-3).

## Al cerrar una tarea

1. Marcar fila en `docs/SCRUM.md` (Hecho / En curso).
2. Añadir línea en **Changelog del backlog**.
3. Si cambia arquitectura, una frase en `README.md`.

## Comandos útiles

```bash
./scripts/dev.sh          # desarrollo
./scripts/build-app.sh    # dist/Psicoterapia Lab.app
./scripts/build-sidecar.sh
```

## Crash conocido (verificar si sigue abierto)

Migración `002_seed.sql`: INSERT `treatments` para Camila debe listar columnas `requires_referral, supervised` si el SELECT tiene 5 valores.

Si la app no abre tras fallo de migración, borrar DB de usuario:
`~/Library/Application Support/cl.psicoterapialab.desktop/psicoterapia.db` (ruta puede variar; buscar `psicoterapia.db`).

## No hacer sin pedirlo

- Servidor cloud / sync online.
- Electron (usar Tauri).
- Commits git salvo que el usuario lo pida.
