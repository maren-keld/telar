# Telar — releases y mantenimiento

Un solo repo y rama **`main`**: app completa, landing, server de suscripciones y CI.

## Contenido propietario (no en git)

Los packs clínicos viven en `packs/` o `packs-src/` (gitignored). Antes de un release:

```bash
./scripts/pack-packs-for-ci.sh   # → dist/telar-packs-bundle.tar.gz
./scripts/build-release-full.sh  # embebe packs en el .app
```

Respalda `packs/` y `secrets/mistral-api.key` fuera del Mac (copia externa o Time Machine).

## Publicar release (Mac + Windows)

```bash
# bump versión en package.json, tauri.conf.json, Cargo.toml, app-version.js
git commit && git push origin main
./scripts/release-beta.sh
# tras CI: gh release edit vX.Y.Z --draft=false --latest
```

Assets: `Telar-macos.zip`, `Telar-windows.exe`, `telar-packs-bundle.tar.gz`.

## Landing (telarapp.cl)

Carpeta estática `landing/` (incluye `vercel.json`). Publica con tu flujo habitual (p. ej. Vercel conectado al repo o deploy manual del directorio).

## API suscripciones (Render)

Ver `server/README.md` y `./scripts/deploy-subscription-api.sh`.

## Scripts legacy (forks públicos)

`strip-clinical-for-public.sh` y `strip-motor-extras-for-public.sh` generan una versión reducida del motor AGPL; ya no se usa en el flujo principal de Telar.
