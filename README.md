# Telar

App de escritorio (macOS y Windows) para gestión clínica local. Los datos del consultorio se guardan **cifrados en tu equipo**.

**Sitio:** [telarapp.cl](https://telarapp.cl) · **Licencia motor:** [AGPL-3.0](LICENSE)

## Repo completo (desarrollo) vs GitHub público vs Releases

| | Repo local / `dev-full` | GitHub `main` (motor AGPL) | [Releases](https://github.com/maren-keld/telar/releases) |
|---|---|---|---|
| Workspace + DB cifrada | ✓ | ✓ | ✓ |
| Packs clínicos | ✓ | demo only | ✓ |
| Neurofeedback Muse 2 | ✓ | — | ✓ |
| Suscripciones Demo/Pro | ✓ | — | ✓ |
| Export PDF programas | ✓ | — | ✓ |

Antes de publicar en GitHub: `./scripts/strip-clinical-for-public.sh` → commit → push a `main`.

Instaladores oficiales: `./scripts/build-release-full.sh` + CI con `telar-packs-bundle.tar.gz`.

## Desarrollo

```bash
npm install
npm run dev
npm run test
./scripts/build-app.sh
./scripts/build-release-full.sh
```

Packs propietarios en `packs/` (gitignored). Ver `docs/OPEN-CORE.md` (interno).

## Privacidad

[telarapp.cl/privacidad](https://telarapp.cl/privacidad.html)
