# Telar — instrucciones para agentes de código

Antes de implementar features o planificar sprints, lee:

1. **[`docs/WORKFLOW.md`](docs/WORKFLOW.md)** — cómo trabajar (comandos, carriles, reglas, estilo)
2. **[`docs/SCRUM.md`](docs/SCRUM.md)** — qué hacer (backlog, Hecho, estacionado)

No dupliques el backlog aquí; SCRUM es la fuente de verdad.

## Contexto en una línea

App de escritorio **TDAH + trauma** (Tauri 2, local, SQLCipher, NF Muse 2 opcional). Fase: **validación beta**.

## Comandos esenciales

```bash
./scripts/dev.sh
./scripts/finish-iteration.sh   # tras cambios en src/
./scripts/open-app.sh
./scripts/qa-smoke.sh
```

## Regla obligatoria al cerrar tareas

Actualizar [`docs/SCRUM.md`](docs/SCRUM.md): **Hecho**, **Changelog** (`YYYY-MM-DD`), **Deuda técnica** si aplica.

## No hacer sin pedirlo

Commits git · DB de usuario · ítems Estacionado en SCRUM · sync clínico cloud.
