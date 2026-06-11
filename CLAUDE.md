# Psicoterapia Lab — instrucciones para Claude Code

## Stack

Tauri 2 + Rust · HTML/CSS/JS · SQLite (SQLCipher) · Python sidecar · AGPL-3.0 · macOS Apple Silicon prioritario

- Frontend: `src/`
- Rust / DB: `src-tauri/`
- Análisis NF: `python/analyze_session.py`
- Migraciones: `src-tauri/migrations/`

## Dev

```bash
./scripts/dev.sh        # dev con hot-reload
./scripts/build-app.sh  # build → dist/Psicoterapia Lab.app
./scripts/open-app.sh   # abrir build
```

Una sola copia canónica del `.app`: `dist/Psicoterapia Lab.app`. No usar `src-tauri/target/`.

No tocar `~/Library/Application Support/cl.psicoterapialab.desktop/psicoterapia.db` salvo petición explícita.

## Regla obligatoria — actualizar `docs/SCRUM.md` al finalizar cualquier tarea

- Mover ítems completados a la sección **Hecho**
- Agregar nuevos ítems al backlog si surgen durante el trabajo
- Registrar el cambio en el **Changelog** con fecha (`YYYY-MM-DD`)
- Si se crea deuda técnica nueva, agregarla a la sección correspondiente

## Contexto del proyecto

- Backlog y prioridades: `docs/SCRUM.md`
- Términos y privacidad: `docs/Términos y Condiciones _ Políticas Privacidad _ Psicoterapia LAB.md`
- La app es 100% local: sin servidor, sin telemetría (por ahora), SQLCipher AES-256
- Licencia AGPL-3.0 con modelo open-core (funciones avanzadas requieren Plan Profesional)
