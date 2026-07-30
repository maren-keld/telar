# Telar — flujo open core (mantenedores)

Documentación para quien mantiene el repo. El README público describe qué ve un clon de GitHub; esto explica el flujo completo.

## Capas

| | GitHub `main` | Local (`dev-full` + `packs/`) | [Releases](https://github.com/maren-keld/telar/releases) |
|---|---|---|---|
| Motor workspace + DB | ✓ | ✓ | ✓ |
| Pack demo | ✓ | ✓ | ✓ |
| Packs clínicos | ✗ | ✓ en `packs/` | ✓ embebidos |
| Neurofeedback Muse 2 | ✗ | ✓ en `dev-full` | ✓ |
| Suscripciones Pro | stub | ✓ en `dev-full` | ✓ |

## Rama `dev-full` (solo local)

Código fuente completo para compilar la app comercial. **No pushear a GitHub.**

```bash
git checkout dev-full
./scripts/build-release-full.sh
git checkout main
```

Si no existe la rama, crearla desde el último commit antes del strip público, o desde un tag de release (p. ej. `v0.1.0-beta.6`).

## Publicar motor en GitHub

```bash
git checkout main
./scripts/strip-clinical-for-public.sh   # idempotente si ya está limpio
./scripts/prepare-public-repo.sh         # debe terminar en OK
git diff                                 # revisar
git commit && git push origin main
```

No hace falta release nueva solo por alinear `main`.

## Release comercial (Mac + Windows)

```bash
git checkout dev-full
# bump versión en package.json, tauri.conf.json, Cargo.toml, app-version.js
git commit && git push origin dev-full   # opcional, solo backup local/remoto privado
./scripts/release-beta.sh                # empuja main si hay cambios core, tag, CI
```

Assets canónicos: `Telar-macos.zip`, `Telar-windows.exe`, `telar-packs-bundle.tar.gz`.

## Respaldo

```bash
./scripts/pack-packs-for-ci.sh   # → dist/telar-packs-bundle.tar.gz
```

Copiar ese tarball fuera del Mac (iCloud carpeta suelta, Time Machine, o asset en release).
