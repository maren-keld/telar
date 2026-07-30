# Telar

App de escritorio (macOS y Windows) para gestión clínica local. Los datos del consultorio se guardan **cifrados en tu equipo**.

**Sitio:** [telarapp.cl](https://telarapp.cl) · **Licencia motor:** [AGPL-3.0](LICENSE)

## Qué hay en este repositorio (motor open source)

Este repo contiene el **motor Telar** bajo AGPL-3.0: workspace clínico, base de datos cifrada y pack demo mínimo.

**No incluye** (solo en [instaladores oficiales](https://github.com/maren-keld/telar/releases)):

- Packs clínicos (TDAH, trauma, escalas validadas, handouts TCC)
- Neurofeedback con Muse 2
- Suscripciones Demo/Pro y exportación PDF de programas
- Backend de pagos

## Descargar app completa

[GitHub Releases](https://github.com/maren-keld/telar/releases) — macOS y Windows con todo lo anterior.

## Desarrollo del motor

```bash
npm install
npm run dev
npm run test
./scripts/build-app.sh
```

Pack demo: `src/packs/demo/` (escala subjetiva + ABC).

## Privacidad

[telarapp.cl/privacidad](https://telarapp.cl/privacidad.html)
