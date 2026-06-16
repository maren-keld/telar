# Telar

App de escritorio (Tauri 2) para gestión clínica y neurofeedback con **Muse 2**. Los datos del consultorio se guardan **solo en tu equipo**, cifrados con SQLCipher.

**Versión actual:** Beta 1 (`0.1.0-beta.1`) · validación con psicólogos en Chile.

**Web:** [telarapp.cl](https://telarapp.cl) · **Plataformas:** macOS y Windows · **Licencia:** [AGPL-3.0](LICENSE)

## Descargar

Instaladores en [GitHub Releases](https://github.com/maren-keld/telar/releases).

## Compilar

Requisitos: Rust, Node.js, Python 3.

```bash
./scripts/build-sidecar.sh
./scripts/dev.sh          # desarrollo
./scripts/build-app.sh    # → dist/Telar.app
```

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/DESARROLLO.md](docs/DESARROLLO.md) | Compilar, probar y contribuir |
| [docs/DISTRIBUCION-RELEASES.md](docs/DISTRIBUCION-RELEASES.md) | Publicar releases |
| [docs/Manual Telar 2026.md](docs/Manual%20Telar%202026.md) | Manual de uso clínico |
| [docs/SUSCRIPCIONES.md](docs/SUSCRIPCIONES.md) | Plan Profesional (API opcional) |

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `src/` | Interfaz (HTML/CSS/JS) |
| `src-tauri/` | App nativa, base de datos, BLE Muse |
| `python/` | Análisis post-sesión NF |
| `server/` | API opcional de suscripciones (Plan Profesional) |
| `landing/` | Sitio estático de presentación |

## Contribuir

Issues y pull requests en GitHub. Al trabajar en el código, revisa [docs/DESARROLLO.md](docs/DESARROLLO.md).
