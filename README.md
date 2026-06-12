# Psicoterapia Lab

App de escritorio (Tauri 2) para gestión clínica y neurofeedback con **Muse 2**. Los datos del consultorio se guardan **solo en tu equipo**, cifrados con SQLCipher.

**Plataformas:** macOS y Windows · **Licencia:** [AGPL-3.0](LICENSE)

## Descargar

Instaladores en [GitHub Releases](https://github.com/maren-keld/psicoterapialab/releases).

## Compilar

Requisitos: Rust, Node.js, Python 3.

```bash
./scripts/build-sidecar.sh
./scripts/dev.sh          # desarrollo
./scripts/build-app.sh    # → dist/Psicoterapia Lab.app
```

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `src/` | Interfaz (HTML/CSS/JS) |
| `src-tauri/` | App nativa, base de datos, BLE Muse |
| `python/` | Análisis post-sesión NF |
| `server/` | API opcional de suscripciones (Plan Profesional) |
| `landing/` | Sitio estático de presentación |
