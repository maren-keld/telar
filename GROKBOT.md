# GROKBOT — contexto Telar (repo local)

Este archivo es el rastro local para Grok Bot en este Mac.
No hay MCP de Grok en Cursor. Grok Bot ya conoce `/Users/felipeuppen/telar`.
Léelo cuando el tema sea **Psypilot**, **Marcela**, **MIC**, **index2**, **IA local**, **firma Windows**, **contactos** o **permisos de escalas**.

Fecha: 4 sep 2026. App: `0.1.0-beta.18`. Contacto: contacto@telarapp.cl.

**CRM privado (no git):** `docs/crm-contactos.md` — Danyau, Raúl, Katerin, Pamela, Sara, Marcela, Luis, Aye. Actualizarlo después de cada conversación. `docs/` está gitignored.

## Cola mañana (viernes 4 sep 2026)

Grok Bot: esto es **redes**, no código. Felipe lo habla acá. Fichas largas en el CRM.

1. **Carolina Danyau (Dayao)** — pack autismo + share de módulos + traer experiencias de CodePen a Telar (`kind: interactive`). Añadirla a LinkedIn. Responderle (interés en el flujo). WhatsApp: Felipe planea otro mensaje **a nombre de Debbie**. Antes de mandar: el CRM ya marca que firmar como persona que no existe es costo en un gremio chico. Hablarlo; si se manda, que sea el mismo canal que ella ya tiene, no un personaje nuevo.
2. **Katerin Osorio Hernández** — comentó «Yo quiero probar!» en el post. **Todavía no hay DM.** Mandar DM con descarga Demo. No liderar con NF.
3. **Pamela de Leiva** — pendiente de conectar / hablarle en LinkedIn. Poca ficha; completar en el CRM cuando haya apellido, qué hace y qué dijo.
4. **Raúl Carrasco Aguilar** — ya bajó Demo. DM 3 sep: le gusta la UI; no compra porque hace TCC (no Muse/BLS). WhatsApp en el CRM. Mensaje corto: plantilla **TDAH adulto 8 sesiones SIN neurofeedback**. Sin videollamada a la fuerza.

No mezclar Danyau (pack privado autismo) con el catálogo público ni con Edgar/Psynder.

## Posición (Marcela, reunión con Aye)

Ps. **Marcela Barría Cárdenas** insistió en lo que diferencia a Telar de Psypilot:

1. **Local** — la ficha vive en el computador del clínico, cifrada.
2. **Open source** — AGPL-3.0, auditable. Psypilot es SaaS cerrado.

Nombrarla en sitio como **asesora en ética de IA en consulta**, en un bloque **Asesoría**, no como parte del equipo de desarrollo (`landing/equipo.html`, `landing/index2.html`).
Confirmar foto/cita textual con ella **antes** de promover index2 a producción.
No desarrolla Telar. No es validadora de NF ni de las escalas.

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
Telar: módulos, 11 escalas clásicas, NF, IA local, dato en el disco, correo.

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

---

## Permisos de escalas (Felipe + Grok Bot)

**Qué pasó (3 sep 2026).** Auditoría de licencias. Código ya recortado en la app. **No reactivar IES-R/SPRINT sin sí por escrito.** Felipe revisa y envía desde **contacto@telarapp.cl**. Grok Bot: pulir tono, no enviar, no inventar emails.

**Telar, para el correo:** app de **escritorio para psicólogos** (Chile/Latam). El paciente **no** es usuario. Ficha **cifrada en el equipo**. Pedimos permiso de **reproducir y puntuar** en software clínico. Ofrecer **videollamada corta** para mostrar la app.

| Color | Escalas | En la app |
|---|---|---|
| Verde | GAD-7, PHQ-9, PCL-5, DASS-21, Rosenberg, OASIS, ODSIS | Siguen. Citar autores. |
| ASRS | Screener WHO **6 ítems** (Parte A) | Recortado. Copyright WHO en pantalla. **No pedir** WHO/Harvard/NYU. |
| Amarillo | A-DES, QOLS | Siguen. Pedir confirmación. Rosenberg: cortesía, ya es dominio público. |
| Rojo | IES-R, SPRINT-E / SPRINT-E-CL | **Ocultos** del catálogo. Código queda; fichas viejas abren. Trauma usa PCL-5. |
| Propios | EED, FER, VAS, `tcc_*`, `sig_*`, BLS | Sin cambio. |

TOS: `landing/terminos.html` — Telar no otorga la licencia de instrumentos de terceros.

### Instrucciones para Grok Bot

Cuando Felipe pegue este bloque o abra este archivo:

1. Pulir cada borrador (claro, breve, respetuoso). EN a Weiss, Davidson, Mapi, Sidran, Rosenberg Foundation. ES a Leiva-Bianchi.
2. Conservar: escritorio / clínico / cifrado local / no es test público / videollamada / contacto@telarapp.cl / telarapp.cl.
3. No enviar. Devolver el texto listo para copiar a Gmail.
4. Verificar `marcleiva@utalca.cl` en el claustro U. de Talca si puedes; no uses `sidran@access.digex.net` (obsoleto). Sidran: `admin@sidran.org` / `help@sidran.org`.

### Borradores

#### 1. IES-R — Dr. Daniel Weiss (EN)

**To:** daniel.weiss@ucsf.edu  
**Subject:** Permission request — IES-R in Telar (desktop clinical software, Chile)

Dear Dr. Weiss,

I am writing to request permission to reproduce and score the Impact of Event Scale–Revised (IES-R; Weiss & Marmar) inside **Telar**, a desktop application for psychologists in Chile and Latin America (telarapp.cl).

Telar is used only by the treating clinician. The patient is not an app user. Charts are stored encrypted on the clinician’s computer; we do not run a public patient-facing questionnaire.

We would reproduce the 22 items, 0–4 anchors, and standard scoring (including the commonly cited total ≥33 as an orientation cutoff), with full author citation on screen.

We have already **withdrawn IES-R from Telar’s catalog** while we wait for written permission. Cases that already contain the module can still open it; we do not offer it as a new instrument.

I would be glad to show the app in a short video call. You can reach me at contacto@telarapp.cl.

Thank you for considering this request.

Felipe Uppen  
Telar · contacto@telarapp.cl · https://telarapp.cl

*Nota interna: CamCOPS reportó denegación en 2015. Pedir igual; no reactivar hasta un sí escrito.*

#### 2. SPRINT / SPRINT-E — Dr. Jonathan R.T. Davidson (EN)

**To:** mail@cd-risc.com  
**Subject:** Permission request — SPRINT in Telar (desktop clinical software, Chile)

Dear Dr. Davidson,

I am writing to request permission to reproduce and score **SPRINT** (and the SPRINT-E brief form) inside **Telar**, a desktop application for psychologists in Chile and Latin America (telarapp.cl).

Telar is used only by the treating clinician. Charts are encrypted on the local machine. It is not a public test for patients.

We would reproduce the items and published scoring, with author citation on screen. A Chilean adaptation (SPRINT-E-CL; Leiva-Bianchi & Gallardo) is the version we had implemented; we are writing the Chilean authors separately.

We have **removed SPRINT from Telar’s catalog** pending written permission. Existing records still open; we will not add the scale to new treatments until you confirm.

I would be glad to walk you through the app on a short video call: contacto@telarapp.cl.

Thank you for your time.

Felipe Uppen  
Telar · contacto@telarapp.cl · https://telarapp.cl

#### 3. SPRINT-E-CL (Chile) — Marcelo Leiva-Bianchi (ES)

**To:** marcleiva@utalca.cl *(verificar en claustro U. de Talca)*  
**Cc:** Ismael Gallardo si hay email público  
**Asunto:** Permiso — SPRINT-E-CL en Telar (software clínico de escritorio)

Estimado Dr. Leiva-Bianchi:

Le escribo para pedir permiso de reproducir y puntuar la adaptación chilena **SPRINT-E-CL** (Leiva-Bianchi & Gallardo, post 27-F) dentro de **Telar**, una aplicación de escritorio para psicólogos en Chile y Latam (telarapp.cl).

Telar la usa solo el clínico. La ficha queda cifrada en su computador; no es un test público para pacientes.

Habíamos implementado los 12 ítems (1–11 suman; ítem 12 ideación suicida no suma, con alerta clínica). **Ya no está en el catálogo** hasta tener permiso escrito. Los tratamientos que ya lo tenían siguen abriéndolo.

También estamos escribiendo al Dr. Jonathan Davidson (SPRINT original).

Si le acomoda, le muestro la app en una videollamada corta: contacto@telarapp.cl.

Gracias por considerarlo.

Felipe Uppen  
Telar · contacto@telarapp.cl · https://telarapp.cl

#### 4. QOLS — Mapi Research Trust (EN)

**To:** eprovidetechnicalsupport@mapi-trust.org  
**También:** formulario ePROVIDE (uso comercial / IT company)  
**Subject:** Commercial/IT license inquiry — QOLS in Telar (desktop clinical software)

Hello,

We request guidance (and, if required, a commercial/IT-company license) to reproduce and score the **Quality of Life Scale (QOLS)** (Flanagan; Burckhardt et al.) inside **Telar**, desktop software for psychologists in Chile and Latin America (telarapp.cl).

Telar is clinician-only. Patient charts are encrypted on the local computer. It is not a public patient questionnaire.

The instrument remains in the app pending your confirmation. We cite the authors on screen.

A short video call to show the implementation is welcome: contacto@telarapp.cl.

Felipe Uppen  
Telar · contacto@telarapp.cl · https://telarapp.cl

#### 5. A-DES — Sidran / autores (EN)

**To:** admin@sidran.org ; help@sidran.org  
**No usar** `sidran@access.digex.net`. Sidran se unió a Traumatic Stress Institute.  
**Cc si hace falta:** Armstrong / Putnam / Carlson  
**Subject:** Permission / status — Adolescent Dissociative Experiences Scale (A-DES) in Telar

Hello,

I am writing about the **Adolescent Dissociative Experiences Scale (A-DES)** (Armstrong, Putnam, Carlson, Libero & Smith) in **Telar**, a desktop application for psychologists in Chile and Latin America (telarapp.cl).

Telar is used by the clinician only; charts are encrypted locally; it is not a public test.

We currently offer A-DES with author citation and would like written confirmation that this clinical-software use is acceptable, or the correct license path.

I can show the module on a short video call: contacto@telarapp.cl.

Thank you.

Felipe Uppen  
Telar · contacto@telarapp.cl · https://telarapp.cl

#### 6. Rosenberg SES — Morris Rosenberg Foundation (EN, cortesía)

**To:** Morris Rosenberg Foundation, Department of Sociology, University of Maryland  
**Subject:** Courtesy notice — Rosenberg Self-Esteem Scale in Telar (already public domain)

Dear colleagues,

This is a courtesy notice, not a permission request.

**Telar** (telarapp.cl) is desktop software for psychologists in Chile and Latin America. We include the **Rosenberg Self-Esteem Scale** (Rosenberg, 1965), which we understand is in the public domain, with on-screen citation.

The app is clinician-only; patient data stay encrypted on the local machine.

If you would like a short look at how we present the scale, I am available for a video call: contacto@telarapp.cl.

Felipe Uppen  
Telar · contacto@telarapp.cl · https://telarapp.cl

#### No enviar: ASRS

En la app quedó el screener de **6 ítems** con el copyright WHO en pantalla. No escribir a WHO ni a Harvard/NYU por la checklist de 18 ítems.
