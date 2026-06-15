# Agent — Piloto módulos TCC (HANDOUT-1)

Prompt para copiar en Cursor Agent (Programmer / Clínica).

---

## Prompt

```
Eres el agente de implementación clínica de Telar. Stack: Tauri 2, JS vanilla en `src/js/`, SQLite local.

## Objetivo
Implementar **3 módulos TCC interactivos** (piloto HANDOUT-1) a partir del contenido en `src/assets/handouts/`. NO implementes los otros 8 handouts en esta tarea.

## Módulos piloto
| ID módulo | Archivo fuente | Slug handout |
|-----------|----------------|--------------|
| `tcc_abc` | `abc-modelo-simple.txt` | abc-modelo-simple |
| `tcc_plan_seguridad` | `plan-seguridad-vital.txt` | plan-seguridad-vital |
| `tcc_activacion` | `activacion-conductual.txt` | activacion-conductual |

Lee el `.txt` de cada handout antes de codificar. El contenido es de **elaboración propia Telar** (no modificar el sentido clínico; sí puedes ajustar redacción UI mínima).

## Patrones existentes (seguir convenciones)
- Módulo con formulario + autosave: `src/js/modules/motivo-consulta.js`, `src/js/modules/gad7.js`
- Registro en catálogo: `src/js/config.js` → `MODULE_DEFS`
- Render: `src/js/modules/index.js`
- Metadatos clínicos: `src/js/module-psychometrics.js` (authors: "Telar — elaboración propia")
- Texto para IA/PDF: `syncModuleReadableText` / `readable-text.js`
- Selector: categoría `intervencion` o nueva `tcc` en `module-selector.js`
- Plantillas TDAH/trauma: `src/js/treatment-templates.js` — añadir handouts piloto donde encaje

## Especificación por módulo

### 1. tcc_abc — Modelo ABC (Versión Simple)
- Secciones: Evento activador, Creencias, Consecuencias
- Campos: textarea por sección (mín. 3 líneas visibles)
- Intro clínica corta arriba (del handout)
- Sin scoring automático
- `allowMultipleInSession: false`

### 2. tcc_plan_seguridad — Plan Seguridad Vital
- 6 secciones numeradas (del handout): situaciones estrés, estrategias alivio, distracción, contactos ideación, servicios crisis, ambiente seguro
- Textarea por sección
- Banner de advertencia discreto: herramienta de apoyo; evaluación de riesgo es responsabilidad del profesional
- `oncePerTreatment: true` recomendado

### 3. tcc_activacion — Activación conductual
- Bloque intro + lista de actividades sugeridas (solo lectura, del handout)
- Casos prácticos: preguntas V/F o opción única (radio), como en el PDF
- Campo libre opcional: "Actividades que incorporaré esta semana"
- Scoring opcional solo en casos prácticos (mostrar aciertos al profesional, no al paciente)

## Integración obligatoria
1. `config.js` — 3 entradas MODULE_DEFS con labels en español
2. `modules/index.js` — export render
3. `module-psychometrics.js` — entrada por módulo (elaboración propia, uso orientativo)
4. `readable-text.js` — case en buildReadableText si hace falta
5. `docs/Términos y Condiciones _ Políticas Privacidad _ Telar.md` — sección 5.x breve: "Material TCC Telar — elaboración propia"
6. `docs/SCRUM.md` — HANDOUT-1 en Hecho + changelog con fecha de hoy

## Handouts restantes (NO tocar ahora)
Los otros 8 slugs en `src/assets/handouts/manifest.json` quedan como assets HTML/txt para v1.1 (visor PDF/HTML o módulos posteriores).

## Calidad
- Dark mode: usar clases existentes (`input`, `card`, `module-title`)
- Autosave con `bindAutoSave` + `workspaceAutoSaveStatus`
- Sin dependencias nuevas
- Español chile, tú/voseo neutro profesional
- NO implementar IA, export handout PDF ni Plan Pro en esta tarea

## Verificación
- `./scripts/finish-iteration.sh` si tocaste `src/`
- Probar en workspace: añadir módulo → rellenar → recargar → datos persisten
- Mencionar en respuesta qué archivos tocaste

## Alcance explícito — NO hacer
- Los otros 8 handouts como módulos JS
- Chat IA (AI-1)
- Portal paciente
- Catálogo TCC completo
```

---

## Después del piloto (v1.1)

1. Módulo "Biblioteca handout" que abre `{slug}.html` embebido + botón imprimir
2. Export programa PDF incluye handouts adjuntos
3. IA (Plan Pro) arma secuencia: ASRS → ABC → Activación → handout PDF
