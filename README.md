# Psicoterapia Lab

**Tu consultorio en tu Mac.** Gestión clínica y neurofeedback integrados, con datos cifrados que **no salen de tu equipo**.

Aplicación de escritorio para psicólogos y profesionales de salud mental que quieren programar tratamientos, registrar sesiones, aplicar instrumentos psicométricos y —si trabajas con EEG— hacer **neurofeedback con Muse 2** en el mismo flujo de trabajo.

No es un SaaS en la nube. No sube fichas de pacientes a servidores ajenos. Funciona **offline**; internet solo se usa si activas el Plan Profesional (suscripción).

---

## ¿Para quién es?

- Psicólogos/as en consulta privada o institucional que diseñan **programas de tratamiento** por sesiones y módulos.
- Profesionales con enfoque **TCC**, psicodinámico complementario (EED) o **neurofeedback** con banda Muse 2.
- Quienes priorizan **privacidad** y control de los datos clínicos en el dispositivo propio.

**Estado actual:** versión **0.1 — acceso anticipado**. Lista para uso clínico real por el equipo desarrollador y colegas beta; la instalación para no-desarrolladores se está simplificando (firma macOS, distribución).

---

## Qué puedes hacer hoy

| Área | Funciones |
|------|-----------|
| **Agenda** | Pacientes por estado (en tratamiento, completado, abandonado, archivado), objetivos y convenios con contactos |
| **Tratamiento** | Sesiones (programada / completada / cancelada), módulos modulares, selector de módulos, biblioteca |
| **Estudio de caso** | Notas estilo Kindle, anotaciones, highlights, panel lateral por tratamiento |
| **Instrumentos** | DASS-21, EED, Rosenberg, QOLS, FER, escalas de ánimo y ansiedad (1–100), diagnóstico, redes de apoyo (genograma), cuestionarios personalizados |
| **Neurofeedback** | Conexión BLE Muse 2, feedback en vivo (banda Beta), grabación, análisis post-sesión, audio de señales |
| **Informes** | Exportar programa de tratamiento a PDF; exportar datos clínicos a CSV (Ajustes → Privacidad) |
| **Seguridad** | Base cifrada (SQLCipher), PIN + Touch ID, bloqueo tras intentos fallidos, borrado total de datos con confirmación |

---

## Por qué es distinto

**1. Local-first de verdad**  
Pacientes, sesiones, notas y EEG quedan en tu Mac (o PC). No hay “copia en nuestra nube” de la ficha clínica.

**2. Neurofeedback dentro del programa**  
No es un software aparte pegado con Excel. El módulo NF vive en la sesión, al lado del DASS-21 o del motivo de consulta.

**3. Seguridad pensada para salud mental**  
Cifrado AES-256, PIN obligatorio, biometría opcional. Tú decides exportar o eliminar todo desde Ajustes.

**4. Open core**  
Código abierto ([AGPL-3.0](LICENSE)). Funciones avanzadas (p. ej. suscripción Plan Profesional) en modelo open-core — ver [términos y privacidad](docs/T%C3%A9rminos%20y%20Condiciones%20_%20Pol%C3%ADticas%20Privacidad%20_%20Psicoterapia%20LAB.md).

---

## Neurofeedback (Muse 2)

- **Dispositivo:** Muse 2 únicamente (no Muse S ni otros modelos).
- **Plataformas:** macOS Apple Silicon (recomendado) y Windows (en validación).
- **Flujo:** conectar banda → feedback en vivo → grabar sesión → análisis automático al terminar.
- **Requisito:** permiso Bluetooth del sistema operativo.

---

## Requisitos

| | |
|---|---|
| **Sistema** | macOS con Apple Silicon (M1/M2/M3/M4) — prioritario. Windows en pruebas. Linux sin BLE por ahora. |
| **Hardware NF** | Interaxon Muse 2 + Bluetooth |
| **Internet** | No obligatorio para uso clínico. Solo para verificar suscripción Plan Profesional. |
| **Instalación hoy** | Build desde código o `.app` generada localmente — ver [Guía de desarrollo](docs/DESARROLLO.md). Instalador firmado para colegas: en roadmap. |

---

## Plan Profesional

Suscripción opcional (~**$15.000 CLP/mes** vía Mercado Pago) para funciones avanzadas del modelo open-core. El cobro **no** almacena datos clínicos: solo consulta si el email pagó. Detalle en [docs/SUSCRIPCIONES.md](docs/SUSCRIPCIONES.md).

---

## Documentación

| Documento | Para qué |
|-----------|----------|
| [Manual clínico 2026](docs/Manual%20Psicoterapia%20LAB%202026.md) | Uso de agenda, sesiones, módulos, NF |
| [Términos y privacidad](docs/T%C3%A9rminos%20y%20Condiciones%20_%20Pol%C3%ADticas%20Privacidad%20_%20Psicoterapia%20LAB.md) | Responsabilidades, datos locales, exportación |
| [Guía de desarrollo](docs/DESARROLLO.md) | Instalar, compilar, contribuir técnicamente |

---

## Próximamente (roadmap público)

- Respaldar base cifrada en un clic (`psicoterapia.enc.db`)
- Exportes NF ampliados (CSV/PDF por sesión)
- Asistente IA con contexto del tratamiento (sin PII innecesaria)
- Instalador macOS firmado (Gatekeeper)
- API de suscripciones en producción (Render)

Backlog detallado: [docs/SCRUM.md](docs/SCRUM.md) (equipo interno).

---

## ¿Colega interesado en probarlo?

Estamos en **acceso anticipado**. Si eres psicólogo/a en Chile (idealmente con Muse 2 y Mac Apple Silicon), escríbenos o abre un issue en este repo describiendo tu consultorio y sistema operativo.

Para compilar tú mismo/a: [docs/DESARROLLO.md](docs/DESARROLLO.md).

---

## Stack (referencia técnica breve)

Tauri 2 · Rust · HTML/CSS/JS · SQLite (SQLCipher) · Python local para análisis NF · AGPL-3.0

Repositorio: [github.com/felipeuppen/psicoterapialab](https://github.com/felipeuppen/psicoterapialab)
