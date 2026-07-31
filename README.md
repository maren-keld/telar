# Telar

App de escritorio (macOS y Windows) para gestión clínica local: programas por sesiones, escalas longitudinales, handouts TCC, neurofeedback Muse 2 y planes Demo/Pro.

**Sitio:** [telarapp.cl](https://telarapp.cl) · **Licencia:** [AGPL-3.0](LICENSE)

## Descargar

[GitHub Releases](https://github.com/maren-keld/telar/releases) — instaladores macOS y Windows.

## Desarrollo

```bash
npm install
npm run dev          # requiere packs en packs/ o packs-src/ (ver abajo)
npm run test
./scripts/build-release-full.sh   # release con packs clínicos embebidos
```

Los **packs clínicos** (`clinical-shared`, `tdah-adulto`, `trauma-regulacion`) no están en git — copia `packs/` o `packs-src/` desde tu respaldo local antes de compilar la app completa.

Pack demo incluido en repo: `src/packs/demo/`.

Mantenedores (releases, landing, suscripciones): [`scripts/OPEN-CORE.md`](scripts/OPEN-CORE.md).

## Privacidad

[telarapp.cl/privacidad](https://telarapp.cl/privacidad.html)
