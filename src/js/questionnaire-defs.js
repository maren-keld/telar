/**
 * Escalas históricas expresadas en el schema declarativo (schema 1).
 *
 * Los renderers de la app siguen siendo los propios de cada escala; esta
 * traducción existe para poder enviarlas al paciente por enlace y volcar las
 * respuestas de vuelta en el módulo. Los textos no se duplican: se importan del
 * renderer que ya los tiene.
 */
import { gad7Items, gad7Options } from './modules/gad7.js';
import { asrsItems, asrsOptions } from './modules/asrs.js';
import { pcl5Items, pcl5Options } from './modules/pcl5.js';
import { iesrItems, iesrOptions } from './modules/iesr.js';
import { adesItems } from './modules/ades.js';
import { sprintItems, sprintOptions } from './modules/sprint-ecl.js';
import {
  DASS21_ANXIETY,
  DASS21_DEPRESSION,
  DASS21_ITEMS,
  DASS21_OPTIONS,
  DASS21_STRESS,
} from './modules/dass21.js';
import { ROSENBERG_ITEMS, ROSENBERG_OPTIONS } from './modules/rosenberg.js';
import { EED_ADAPT, EED_INTER, EED_ITEMS, EED_MALAD, EED_OPTIONS } from './modules/eed.js';
import { QOLS_ITEMS, QOLS_OPTIONS } from './modules/qols.js';
import { FER_FORTALEZAS, FER_OPTIONS, FER_RIESGOS } from './modules/escala-fer.js';
import { getScorer } from './pack-registry.js';
import { isLicensePendingModule } from './license-pending-modules.js';

/** Guarda las respuestas en `data.answers` (lo habitual). */
const ANSWERS_STORAGE = { kind: 'answers' };

function textItems(list) {
  return list.map((text) => ({ text: String(text) }));
}

function subscale(id, label, items) {
  return { id, label, items };
}

/* ------------------------------- escalas ------------------------------ */

function gad7Def() {
  return {
    schema: 1,
    id: 'gad7',
    title: 'GAD-7 — Ansiedad generalizada',
    subtitle: '7 ítems · escala 0–3 · últimas 2 semanas.',
    instructions:
      'Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?',
    items: textItems(gad7Items()),
    options: gad7Options(),
    scoring: {
      kind: 'sum',
      max: 21,
      bands: [
        { max: 4, label: 'Ansiedad mínima', cls: 'psych-band--minimal' },
        { max: 9, label: 'Ansiedad leve', cls: 'psych-band--mild' },
        { max: 14, label: 'Ansiedad moderada', cls: 'psych-band--moderate' },
        { max: 21, label: 'Ansiedad severa', cls: 'psych-band--severe' },
      ],
      cutoff: { value: 10, label: 'ansiedad clínicamente significativa' },
    },
    attribution: { authors: 'Spitzer, Kroenke, Williams & Löwe', year: 2006, license: 'Uso clínico con atribución (Pfizer / autores)' },
    storage: ANSWERS_STORAGE,
  };
}

function asrsDef() {
  return {
    schema: 1,
    id: 'asrs',
    title: 'ASRS v1.1 — Síntomas de TDAH en adultos',
    subtitle: '6 ítems · escala 0–4 · últimos 6 meses · screener WHO (Parte A).',
    instructions:
      'Responda cada pregunta pensando en cómo se ha sentido y comportado durante los últimos 6 meses.',
    items: textItems(asrsItems()),
    options: asrsOptions(),
    scoring: {
      kind: 'sum',
      max: 24,
      bands: [{ max: 24, label: '' }],
      subscales: [subscale('parte_a', 'Parte A (tamizaje)', [0, 1, 2, 3, 4, 5])],
    },
    attribution: {
      authors: 'Kessler et al. / OMS',
      year: 2005,
      license: 'Screener de 6 ítems; copyright WHO (uso con atribución, sin aprobación previa)',
    },
    storage: ANSWERS_STORAGE,
  };
}

function pcl5Def() {
  return {
    schema: 1,
    id: 'pcl5',
    title: 'PCL-5 — Síntomas de estrés postraumático',
    subtitle: '20 ítems · escala 0–4 · último mes.',
    instructions:
      'A continuación hay una lista de problemas que las personas a veces tienen después de una experiencia muy estresante. Indique cuánto le ha molestado cada problema en el último mes.',
    items: textItems(pcl5Items()),
    options: pcl5Options(),
    scoring: {
      kind: 'sum',
      max: 80,
      bands: [{ max: 80, label: '' }],
      cutoff: { value: 31, label: 'tamizaje positivo' },
    },
    attribution: { authors: 'Weathers et al. (National Center for PTSD)', year: 2013, license: 'Dominio público' },
    storage: ANSWERS_STORAGE,
  };
}

function iesrDef() {
  return {
    schema: 1,
    id: 'iesr',
    title: 'IES-R — Impacto del evento (revisada)',
    subtitle: '22 ítems · escala 0–4 · últimos 7 días.',
    instructions:
      'Pensando en el evento que conversamos, indique cuánto le ha molestado cada dificultad durante los últimos 7 días.',
    items: textItems(iesrItems()),
    options: iesrOptions(),
    scoring: {
      kind: 'sum',
      max: 88,
      bands: [{ max: 88, label: '' }],
      cutoff: { value: 33, label: 'impacto clínicamente relevante' },
    },
    attribution: { authors: 'Weiss & Marmar', year: 1997, license: 'Pendiente de permiso / oculto en el catálogo' },
    storage: ANSWERS_STORAGE,
  };
}

function adesDef() {
  return {
    schema: 1,
    id: 'ades',
    title: 'A-DES — Experiencias disociativas en adolescentes',
    subtitle: '30 ítems · escala 0–10.',
    instructions:
      'Marque para cada frase qué tan seguido le pasa, donde 0 es «nunca» y 10 es «siempre».',
    items: adesItems().map((text) => ({
      text: String(text),
      kind: 'slider',
      min: 0,
      max: 10,
      step: 1,
      minLabel: 'Nunca',
      maxLabel: 'Siempre',
    })),
    options: [],
    scoring: {
      kind: 'mean',
      max: 10,
      bands: [
        { max: 3, label: 'Bajo' },
        { max: 6, label: 'Medio' },
        { max: 10, label: 'Alto' },
      ],
      cutoff: { value: 4, label: 'tamizaje positivo' },
    },
    attribution: { authors: 'Armstrong, Putnam, Carlson, Libero & Smith', year: 1997, license: 'Uso con cita; confirmar titular (Sidran / autores)' },
    storage: ANSWERS_STORAGE,
  };
}

function sprintDef() {
  const items = textItems(sprintItems());
  items.push({ text: '¿Hay alguna posibilidad de que usted tenga deseos de herirse o suicidarse?' });
  return {
    schema: 1,
    id: 'sprint_ecl',
    title: 'SPRINT-E-CL — Impacto del trauma',
    subtitle: '11 ítems (0–4) + ítem de riesgo.',
    instructions: 'Pensando en lo que ocurrió, responda cuánto le ha afectado cada aspecto.',
    items,
    options: sprintOptions(),
    perItemOptions: {
      11: [
        { v: 0, label: 'No' },
        { v: 1, label: 'Sí' },
      ],
    },
    scoring: {
      kind: 'sum',
      max: 44,
      bands: [{ max: 44, label: '' }],
      cutoff: { value: 17, label: 'síntomas elevados' },
      // El ítem 12 no suma: queda fuera de las subescalas y solo activa la alerta.
      subscales: [subscale('likert', 'Ítems 1–11', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])],
    },
    riskItems: [{ index: 11, gte: 1, message: 'Posible ideación suicida — abordar en sesión.' }],
    attribution: { authors: 'Connor & Davidson · adaptación chilena 27-F', license: 'Pendiente de permiso / oculto en el catálogo' },
    storage: ANSWERS_STORAGE,
  };
}

function dass21Def() {
  return {
    schema: 1,
    id: 'dass21',
    title: 'DASS-21 — Depresión, ansiedad y estrés',
    subtitle: '21 ítems · escala 0–3 · última semana.',
    instructions:
      'Lea cada frase y marque cuánto le ocurrió durante la última semana. No hay respuestas correctas o incorrectas.',
    items: textItems(DASS21_ITEMS),
    options: DASS21_OPTIONS,
    scoring: {
      kind: 'sum',
      max: 63,
      bands: [{ max: 63, label: '' }],
      subscales: [
        subscale('estres', 'Estrés', DASS21_STRESS),
        subscale('ansiedad', 'Ansiedad', DASS21_ANXIETY),
        subscale('depresion', 'Depresión', DASS21_DEPRESSION),
      ],
    },
    attribution: { authors: 'Lovibond & Lovibond', year: 1995, license: 'Dominio público (no vender la escala; resultados al clínico)' },
    storage: ANSWERS_STORAGE,
  };
}

function rosenbergDef() {
  return {
    schema: 1,
    id: 'rosenberg',
    title: 'Escala de Autoestima de Rosenberg (EAR)',
    subtitle: '10 ítems · escala 1–4.',
    instructions: 'Indique cuánto está de acuerdo con cada frase sobre usted mismo/a.',
    items: ROSENBERG_ITEMS.map((it) => ({ text: it.text, reverse: it.reverse })),
    options: ROSENBERG_OPTIONS,
    scoring: {
      kind: 'sum',
      reverseMax: 5,
      max: 40,
      bands: [
        { max: 25, label: 'Autoestima baja' },
        { max: 29, label: 'Autoestima media' },
        { max: 40, label: 'Autoestima alta' },
      ],
    },
    attribution: { authors: 'Rosenberg', year: 1965, license: 'Dominio público (citar Rosenberg 1965)' },
    storage: ANSWERS_STORAGE,
  };
}

function eedDef() {
  return {
    schema: 1,
    id: 'eed',
    title: 'EED — Estrategias de defensa',
    subtitle: '26 ítems · escala 1–5.',
    instructions: 'Indique cuánto se identifica con cada frase.',
    items: textItems(EED_ITEMS),
    options: EED_OPTIONS,
    scoring: {
      kind: 'sum',
      max: 130,
      bands: [{ max: 130, label: '' }],
      subscales: [
        { ...subscale('adaptativas', 'Adaptativas', EED_ADAPT), kind: 'mean' },
        { ...subscale('intermedias', 'Intermedias', EED_INTER), kind: 'mean' },
        { ...subscale('desadaptativas', 'Desadaptativas', EED_MALAD), kind: 'mean' },
      ],
    },
    attribution: { authors: 'Manual EED — Telar', license: 'Propietario' },
    storage: ANSWERS_STORAGE,
  };
}

function qolsDef() {
  return {
    schema: 1,
    id: 'qols',
    title: 'QOLS — Calidad de vida',
    subtitle: '16 ítems · escala 1–7.',
    instructions: 'Indique qué tan satisfecho/a se siente hoy con cada área de su vida.',
    items: QOLS_ITEMS.map((it) => ({ text: it.text, subscale: it.domain })),
    options: QOLS_OPTIONS,
    scoring: {
      kind: 'sum',
      max: 112,
      bands: [{ max: 112, label: '' }],
    },
    attribution: { authors: 'Flanagan · Burckhardt', year: 1982, license: 'Copyright Burckhardt; uso clínico/software sujeto a Mapi / autor' },
    storage: ANSWERS_STORAGE,
  };
}

function ferDef() {
  const items = [...textItems(FER_FORTALEZAS), ...textItems(FER_RIESGOS)];
  return {
    schema: 1,
    id: 'escala_fer',
    title: 'EFR — Fortalezas y riesgos',
    subtitle: '12 ítems · escala 0–4.',
    instructions: 'Indique con qué frecuencia le ocurre cada situación.',
    items,
    options: FER_OPTIONS,
    scoring: {
      kind: 'sum',
      max: 48,
      bands: [{ max: 48, label: '' }],
      subscales: [
        subscale('fortalezas', 'Fortalezas', [0, 1, 2, 3, 4, 5]),
        subscale('riesgos', 'Riesgos', [6, 7, 8, 9, 10, 11]),
      ],
    },
    riskItems: [
      {
        index: 6,
        gte: 1,
        message: 'Refiere pensamientos de daño a sí mismo/a — abordar en sesión.',
      },
    ],
    attribution: { authors: 'Telar', license: 'Propietario' },
    storage: ANSWERS_STORAGE,
  };
}

function subjectiveDef(id, title, field, minLabel, maxLabel) {
  return {
    schema: 1,
    id,
    title,
    subtitle: 'Un solo valor de 1 a 100.',
    instructions: 'Mueva el control hasta el número que mejor represente los últimos 7 días.',
    items: [
      { text: title, kind: 'slider', min: 1, max: 100, step: 1, minLabel, maxLabel },
    ],
    options: [],
    scoring: { kind: 'sum', max: 100, bands: [{ max: 100, label: '' }] },
    // Estas escalas no guardan `answers`, sino un campo único en el módulo.
    storage: { kind: 'field', field },
  };
}

const BUILTIN_DEFS = {
  gad7: gad7Def,
  asrs: asrsDef,
  pcl5: pcl5Def,
  iesr: iesrDef,
  ades: adesDef,
  sprint_ecl: sprintDef,
  dass21: dass21Def,
  rosenberg: rosenbergDef,
  eed: eedDef,
  qols: qolsDef,
  escala_fer: ferDef,
  escala_animo: () =>
    subjectiveDef('escala_animo', 'Escala subjetiva de ánimo', 'mood_score', 'Muy bajo', 'Muy alto'),
  escala_ansiedad: () =>
    subjectiveDef(
      'escala_ansiedad',
      'Escala subjetiva de ansiedad',
      'anxiety_score',
      'Muy baja',
      'Muy alta',
    ),
};

/**
 * Definición declarativa de una escala para compartirla por enlace.
 * Los packs clínicos aportan la suya con `shareDef` en su scorer.
 * @returns {object|null}
 */
export function toShareDef(moduleType) {
  if (isLicensePendingModule(moduleType)) return null;
  const builtin = BUILTIN_DEFS[moduleType];
  if (builtin) return builtin();
  const fromPack = getScorer(moduleType)?.shareDef;
  if (typeof fromPack === 'function') return fromPack();
  return fromPack || null;
}

/** ¿Esta escala se puede enviar al paciente por enlace? */
export function isShareableScale(moduleType) {
  return Boolean(toShareDef(moduleType));
}

/** Escalas del núcleo que se pueden compartir (para tests y diagnósticos). */
export function shareableBuiltinTypes() {
  return Object.keys(BUILTIN_DEFS).filter((id) => !isLicensePendingModule(id));
}
