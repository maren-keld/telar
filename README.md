# Telar

App de escritorio (macOS y Windows) para gestión clínica local. Los datos del consultorio se guardan **cifrados en tu equipo**.

**Sitio:** [telarapp.cl](https://telarapp.cl) · **Licencia motor:** [AGPL-3.0](LICENSE)

## Motor open source vs contenido clínico

Este repositorio contiene el **motor Telar** bajo licencia AGPL-3.0: workspace clínico, base de datos cifrada, neurofeedback con Muse 2, suscripciones Free/Pro y exportación.

El **contenido clínico** (packs: escalas validadas ASRS/GAD-7/PCL-5, handouts TCC, plantillas de 8 sesiones) se distribuye por separado:

- **Instalador oficial** en [GitHub Releases](https://github.com/maren-keld/telar/releases) — app completa con todos los packs
- **Licencia Pro** / telarapp.cl para uso clínico completo

El repo incluye un **pack demo** mínimo (`src/packs/demo/`: escala subjetiva + módulo ABC) para compilar y probar el motor sin contenido propietario.

## Descargar app completa

Instaladores con packs clínicos: [GitHub Releases](https://github.com/maren-keld/telar/releases).

## Desarrollo

```bash
npm install
npm run dev          # Tauri dev (carga packs desde src/packs/)
npm run test         # tests frontend + e2e
./scripts/build-app.sh              # build motor + packs presentes
./scripts/build-release-full.sh     # release con packs propietarios
```

Packs propietarios van en `packs/` (gitignored) o `src/packs/clinical-shared/` etc. Ver `docs/OPEN-CORE.md` (interno).

## Privacidad

Política de datos en [telarapp.cl/privacidad](https://telarapp.cl/privacidad.html).
