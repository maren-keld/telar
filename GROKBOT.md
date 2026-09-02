# GROKBOT — contexto Telar (repo local)

Este archivo es el rastro local para Grok Bot en este Mac.
No hay MCP de Grok en Cursor. Grok Bot ya conoce `/Users/felipeuppen/telar`.
Léelo cuando el tema sea **Psypilot**, **Marcela**, **MIC**, **index2**, **IA local** o **firma Windows**.

Fecha: 29 ago 2026. App: `0.1.0-beta.16`. Contacto: contacto@telarapp.cl.

## Posición (Marcela, reunión con Aye)

Ps. **Marcela Barría Cárdenas** insistió en lo que diferencia a Telar de Psypilot:

1. **Local** — la ficha vive en el computador del clínico, cifrada.
2. **Open source** — AGPL-3.0, auditable. Psypilot es SaaS cerrado.

Nombrarla en sitio como **asesora en ética de IA en consulta**, en un bloque **Asesoría**, no como parte del equipo de desarrollo (`landing/equipo.html`, `landing/index2.html`).
Confirmar foto/cita textual con ella **antes** de promover index2 a producción.
No desarrolla Telar. No es validadora de NF ni de las 13 escalas.

### Propuesta para Marcela (para la próxima conversación)

1. Leer el preprint MIC (Felipe) y devolverle un mapeo honesto Soberanía / Secreto / Profundidad ↔ Telar. No decir «implementamos el MIC».
2. **Asesoría nombrada** en /equipo, con el deslinde: no es staff.
3. **Primer módulo vendible de la app**, de su autoría (MIC en sesión). Ella se lleva autoría + un % o precio; puede mencionarlo en su curso de IA+psi a colegas.
4. **Curso NF: tramo online gratis** (Copiapó/Viña el presenciales es otro cupo). Para que entre a Telar con un caso, no un PDF. No la convierte en docente de NF.
5. Contacto: contacto@telarapp.cl.

### Luis (curso NF 2025)

Hizo el curso de neurofeedback el año pasado. Posible cara de **colaboración**, no cofundador. Falta apellido, foto y ok explícito. No mezclarlo con Marcela.

## Modelo de Integración Consciente (MIC)

Para seguir colaborando y hacer redes. Planteárselo a ella; Telar no «implementa el MIC», se deja auditar contra él.

- Sitio: https://iaysaludmental.com/
- LinkedIn: `psmarcelabarria`
- Preprint: Barría Cárdenas, 2026, Zenodo **10.5281/zenodo.19528297** (archivos también en record 19528298)

Tres pilares:

| Pilar | Qué es | Cómo Telar lo sostiene |
|---|---|---|
| **Soberanía** | El juicio queda en el clínico | IA apagada; diálogo Aplicar / ahora no; no diagnostica |
| **Secreto** | Confidencialidad; no poner el caso real en tools ajenas | SQLite cifrada; respaldo **opcional** a *su* iCloud/Dropbox/Drive, ya cifrado (age). Telar no puede abrir |
| **Profundidad** | Proteger el vínculo vs la alteridad vacía del LLM | Módulos en la hora (TCC, narrativa), no chat-como-terapia |

Pitch para ella: el copiloto-siempre-on de Psypilot choca con Secreto (ficha + audio en Azure) y con Profundidad (la hora se documenta fuera de la sala). Telar apaga la IA y recomienda Ollama.

## Competidor: Psypilot (Medea Mind, Madrid)

Mismo comprador, misma banda de precio, mismo gancho de 3 casos / ~€19 vs $19.990.

- Ellos: SaaS web. Copiloto permanente. Transcripción con cupo. Ficha en **Azure West Europe**. RGPD como identidad. Teams (roles, SSO).
- Telar: escritorio Mac/Windows. Escalas, módulos, Muse 2. IA off. Local-first.

**PII / anonimización:** ellos sustituyen `[empresa]`, `[colega]` en la transcripción porque el audio **ya está** en su servidor. Telar no transcribe en la nube: no hay qué tapar. No es que «ganen en privacidad de PII»; ganan en *feature de transcript*.

**Notas e informes IA:** ellos ganan *nota desde audio*. Telar gana *plan desde ficha puntuada*. No es el mismo job.

**Medea Mix©:** cribado propio 9 factores / ~10 min / dicen ~2.000 participantes. No es GAD-7. En Pro tienen GAD-7 y PHQ-9; ISI, BDI-II, DAS-7 «próximamente». Telar: 13 clásicas. Jobs distintos. El Frontiers (autores internos) pide evaluación independiente de Mix.

**Head start:** Medea Mind se presenta desde 2020 (premios 2021–22). No es una startup de 2023 contra Telar 2026.

**Soporte:** Telar correo (contacto@telarapp.cl) en Demo y Pro. Ellos no venden eso como canal de todos los planes.

**IA:** con Ollama, Telar es ilimitada en el equipo. La de ellos es el producto y va con cupo en Free/transcripciones.

Empate: contexto por caso, humano en el loop, precio de entrada.
Ellos: transcripción, browser, Teams, Mix, cara académica (4 perfiles + fondos).
Telar: módulos, 13 escalas clásicas, NF, IA local, dato en el disco, correo.

Canvas: [Psypilot vs Telar](/Users/felipeuppen/.cursor/projects/Users-felipeuppen-telar/canvases/psypilot-vs-telar.canvas.tsx)

### Transcripción

Dolor real para quien odia redactar la nota. **No clonar en la nube.** Choca con MIC-Secreto y con el moat local. Si algún día: Whisper on-device, no P0.

### Equipos / clínicas

Psypilot Teams = EHR multi-user en su nube. Telar: `instituciones.html` — misma medición, ficha en cada PC. No fingir un servidor central de pacientes.

## Landing

- `landing/index.html` = **telarapp.cl actual**. Pedagógicamente flojo vs Psypilot. No reemplazar hasta que Felipe lo pida.
- `landing/index2.html` = **borrador noindex**. Mega-nav Producto/Recursos, 4 pasos, espectáculo del cifrado local + nube privada opcional, tabla ChatGPT | Psypilot | Telar (incluye **offline**: ChatGPT y Psypilot no; Telar sí), MIC, Marcela asesora, NF Copiapó/Viña, honestidad SmartScreen Windows.
- Copiar **pedagogía** del sitio (mega-nav, un trabajo por página). El felt-sense «SpaceX» es real en la **app** (Muse, candado, Ollama), no en el index actual. No aplanar a morado SaaS.

## IA en la app

- Default: **apagada**.
- Primera pregunta en el dock (`#rightsidebar` / notes panel) abre `openAiSettingsModal({ source: 'dock' })` — reutilizable desde Ajustes.
- Recomendar **IA local privada** (Ollama). Correo de ayuda en el modal (contacto@telarapp.cl).
- UI: dos columnas **modos | modelos**. Modelos = repeating group (cards), no solo dropdown. Badge **Instalado** + check si Ollama ya tiene el tag.
- Diferencias: Qwen 3B (probar), Qwen 7B (recomendado, mejor español clínico), Llama 3.2 3B (RAM justa), Mistral 7B (castellano general).
- **Nunca** `registro_inicial` ni `motivo_consulta` en sesión 2+. Prompt + `sanitizePlan` (`INTAKE_ONCE`).

## Categoría de módulos

Id interno `significado` (no migrar). Label visible: **Narrativa**.

## Pain point #1: instalación / firma Windows

Psypilot = «Empezar gratis» en el browser. Telar cobra el impuesto .dmg/.exe.

**Urgente:** firma **Authenticode** del instalador Windows. Hoy CI sube `Telar-windows.exe` **sin** cert (`release.yml` + `package-windows-installer.sh`). SmartScreen asusta. Mac tiene `scripts/sign-macos-app.sh`. Comprar certificado; no hay uno en el repo. No inventar un build firmado.

## Open core vs app completa

`main` público = motor AGPL + demo. Packs clínicos y NF completo: rama local **`dev-full`**, no pushear. Ver `.cursor/rules/telar-open-core.mdc`.
