# Psicoterapia Lab

**Tu consultorio en tu computador.** App de escritorio para **macOS y Windows**: gestión clínica y neurofeedback integrados, con datos cifrados que **no salen de tu equipo**.

Repositorio de código (AGPL-3.0). Los colegas clínicos **no necesitan mirar GitHub** — para compartir el producto usa **[Pitch de 1 página](docs/PITCH-1-PAGINA.md)** (WhatsApp, mail, impreso).

---

## Qué es

Software de escritorio para psicólogos y profesionales de salud mental: programas de tratamiento por sesiones y módulos, instrumentos psicométricos, notas de estudio de caso y —con banda **Muse 2**— neurofeedback en el mismo flujo.

**Offline por defecto.** No es SaaS: la ficha clínica no vive en servidores ajenos. Internet solo si activas Plan Profesional (verificar suscripción).

**Estado:** versión **0.1 — acceso anticipado**. Uso clínico real; distribución instalable para terceros en mejora continua.

---

## Plataformas

| Sistema | Estado |
|---------|--------|
| **macOS** (Apple Silicon y Intel) | Soportado — desarrollo y uso principal |
| **Windows** 10/11 | Soportado — NF con Muse 2 vía BLE nativo |
| **Linux** | Sin neurofeedback BLE por ahora; resto en roadmap |

Prioridad de desarrollo: **macOS Apple Silicon** (equipo actual), pero el producto **no es solo Mac**.

---

## Funciones (resumen)

Agenda y objetivos · tratamientos por sesiones · módulos (DASS-21, EED, Rosenberg, QOLS, FER, escalas, genograma, custom) · notas Kindle · NF Muse 2 · PDF programa · export CSV · cifrado SQLCipher + PIN (Touch ID en Mac compatible).

Detalle clínico: [Manual 2026](docs/Manual%20Psicoterapia%20LAB%202026.md) · pitch para colegas: [PITCH-1-PAGINA.md](docs/PITCH-1-PAGINA.md)

---

## Para desarrolladores

| Documento | Contenido |
|-----------|-----------|
| [DESARROLLO.md](docs/DESARROLLO.md) | Compilar, dev, build, sidecar |
| [SCRUM.md](docs/SCRUM.md) | Backlog interno |
| [SUSCRIPCIONES.md](docs/SUSCRIPCIONES.md) | API Mercado Pago / Render |
| [LANDING.md](docs/LANDING.md) | Landing pública (Vercel / GitHub Pages) |

```bash
./scripts/build-sidecar.sh && ./scripts/dev.sh
```

---

## Licencia

[AGPL-3.0](LICENSE) · Plan Profesional opcional ~$15.000 CLP/mes · [Privacidad y términos](docs/T%C3%A9rminos%20y%20Condiciones%20_%20Pol%C3%ADticas%20Privacidad%20_%20Psicoterapia%20LAB.md)
