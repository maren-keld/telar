import { MODULE_DEFS } from './config.js';
import { formatTccHandoutReadable } from './tcc-handout-defs.js';
import { saveModuleData } from './db.js';
import { asrsSummary } from './asrs-scoring.js';
import { pcl5Summary } from './pcl5-scoring.js';
import { sprintSummary } from './sprint-scoring.js';
import { iesrSummary } from './iesr-scoring.js';
import { adesSummary } from './ades-scoring.js';
import { parseJsonSafe } from './utils.js';

function linesFromObject(obj, labels) {
  return labels
    .map(({ key, label }) => {
      const v = obj[key];
      if (v == null || v === '') return null;
      return `${label}: ${v}`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatAnswersTotal(answers, label, max) {
  if (!answers?.some((v) => v !== null && v !== '')) return '';
  const total = answers.reduce((a, v) => a + (Number(v) || 0), 0);
  return `${label}: ${total}${max != null ? `/${max}` : ''}`;
}

function formatDass21(d) {
  const answers = d.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return '';
  const sum = (idx) => idx.reduce((a, i) => a + (Number(answers[i]) || 0), 0) * 2;
  const stress = sum([0, 5, 7, 10, 11, 13, 17]);
  const anxiety = sum([1, 3, 6, 8, 14, 18, 19]);
  const depression = sum([2, 4, 9, 12, 15, 16, 20]);
  return `Estrés: ${stress} · Ansiedad: ${anxiety} · Depresión: ${depression} (DASS-42)`;
}

function formatGad7(d) {
  const answers = d.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return '';
  const total = answers.reduce((a, v) => a + (Number(v) || 0), 0);
  let band = '—';
  if (total <= 4) band = 'mínima';
  else if (total <= 9) band = 'leve';
  else if (total <= 14) band = 'moderada';
  else band = 'severa';
  return `Total: ${total}/21 (${band})`;
}

function formatAsrs(d) {
  const s = asrsSummary(d);
  if (!s) return '';
  return [
    `Parte A: ${s.partAPositive}/6 síntomas positivos`,
    `Tamizaje: ${s.screenLabel}`,
    s.total != null ? `Suma total: ${s.total}/72` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatRosenberg(d) {
  const answers = d.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return '';
  const reverse = [2, 4, 7, 8, 9];
  let total = 0;
  for (let i = 0; i < answers.length; i++) {
    const raw = answers[i];
    if (raw === null || raw === '') continue;
    const v = Number(raw);
    total += reverse.includes(i) ? 5 - v : v;
  }
  let band = '—';
  if (total <= 25) band = 'baja';
  else if (total <= 29) band = 'media';
  else band = 'alta';
  return `Total: ${total}/40 (autoestima ${band})`;
}

function formatDxItems(items) {
  return (items || [])
    .map((x) => {
      const item = typeof x === 'string' ? { text: x, checked: false } : x;
      const text = String(item?.text ?? '').trim();
      if (!text) return null;
      return item.checked ? `✓ ${text}` : text;
    })
    .filter(Boolean)
    .join('; ');
}

function formatDiagnostico(d) {
  const structured = d.structured || {};
  const structLines = linesFromObject(structured, [
    { key: 'comorbidities', label: 'Comorbilidades' },
    { key: 'trauma_events', label: 'Eventos traumáticos / antecedentes' },
    { key: 'medication', label: 'Medicación psicotrópica' },
    { key: 'dx_notes', label: 'Notas clínicas estructuradas' },
  ]);
  const custom = d.custom_diagnosis?.trim();
  const problems = (d.problems || []).filter((p) => p.assigned && p.name);
  const problemText = problems
    .map((p) => {
      const ind = formatDxItems(p.indicators);
      const obj = formatDxItems(p.objectives);
      return [p.name, ind ? `Indicadores: ${ind}` : null, obj ? `Objetivos: ${obj}` : null]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  return [custom ? `Diagnóstico personalizado:\n${custom}` : null, structLines, problemText]
    .filter(Boolean)
    .join('\n\n');
}

function formatIesr(d) {
  const s = iesrSummary(d);
  if (!s) return '';
  return [
    s.event ? `Evento: ${s.event}` : null,
    s.total != null ? `Total: ${s.total}/88` : null,
    s.intrusion != null ? `Intrusión: ${s.intrusion}` : null,
    s.avoidance != null ? `Evitación: ${s.avoidance}` : null,
    s.hyperarousal != null ? `Hiperactivación: ${s.hyperarousal}` : null,
    s.screenLabel ? `Impacto: ${s.screenLabel}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatPcl5(d) {
  const s = pcl5Summary(d);
  if (!s) return '';
  return [
    s.total != null ? `Total: ${s.total}/80` : null,
    s.screenLabel ? `Tamizaje: ${s.screenLabel}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatSprintEcl(d) {
  const s = sprintSummary(d);
  if (!s) return '';
  return [
    s.total != null ? `Suma ítems 1–11: ${s.total}/44` : null,
    s.screenLabel ? `Tamizaje: ${s.screenLabel}` : null,
    s.suicideRisk ? 'Alerta: ideación suicida (ítem 12)' : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatNeurofeedback(d) {
  const meta = d.last_meta || {};
  const res = d.last_results || {};
  const notes = d.session_notes?.trim();
  return [
    meta.protocol ? `Protocolo: ${meta.protocol}` : null,
    meta.device ? `Dispositivo: ${meta.device}` : null,
    meta.duration_sec != null ? `Duración: ${meta.duration_sec} s` : null,
    res.calm_pct != null ? `Calma: ${res.calm_pct}%` : null,
    res.attentive_pct != null ? `Atención: ${res.attentive_pct}%` : null,
    res.relaxation_pct != null ? `Relajación: ${res.relaxation_pct}%` : null,
    notes ? `Notas: ${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatAdes(d) {
  const s = adesSummary(d);
  if (!s) return '';
  return [
    s.mean != null ? `Media total: ${s.mean.toFixed(1)}/10` : null,
    s.severityLabel ? `Nivel: ${s.severityLabel}` : null,
    s.taxonMean != null ? `A-DES-T: ${s.taxonMean.toFixed(1)}/10` : null,
    s.amnesia != null ? `Amnesia: ${s.amnesia.toFixed(1)}` : null,
    s.absorption != null ? `Absorción: ${s.absorption.toFixed(1)}` : null,
    s.passive != null ? `Influencia pasiva: ${s.passive.toFixed(1)}` : null,
    s.depersonalization != null ? `Despersonalización: ${s.depersonalization.toFixed(1)}` : null,
    s.screenLabel ? `Tamizaje: ${s.screenLabel}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatBilateral(d) {
  const parts = [
    d.speed_hz != null ? `Velocidad: ${d.speed_hz} Hz` : null,
    d.elapsed_sec != null && d.elapsed_sec > 0 ? `Tiempo: ${d.elapsed_sec} s` : null,
    d.target?.trim() ? `Objetivo: ${d.target.trim()}` : null,
    d.notes?.trim() ? `Notas: ${d.notes.trim()}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

function formatTccAbc(d) {
  return linesFromObject(d, [
    { key: 'activador', label: 'Evento activador' },
    { key: 'creencias', label: 'Creencias' },
    { key: 'consecuencias', label: 'Consecuencias' },
  ]);
}

function formatTccPlanSeguridad(d) {
  return linesFromObject(d, [
    { key: 'stress_situations', label: 'Situaciones de estrés' },
    { key: 'relief_strategies', label: 'Estrategias de alivio' },
    { key: 'distraction', label: 'Distracción' },
    { key: 'suicide_contacts', label: 'Contactos ideación suicida' },
    { key: 'crisis_services', label: 'Servicios de crisis' },
    { key: 'safe_environment', label: 'Ambiente seguro' },
  ]);
}

const TCC_ACTIVACION_QUIZ = [
  { key: 'q0', correct: 'c' },
  { key: 'q1', correct: 'b' },
  { key: 'q2', correct: 'b' },
];

function formatTccActivacion(d) {
  const parts = [];
  const quiz = d.quiz || {};
  let correct = 0;
  let answered = 0;
  for (const q of TCC_ACTIVACION_QUIZ) {
    const v = quiz[q.key];
    if (v == null || v === '') continue;
    answered += 1;
    if (v === q.correct) correct += 1;
  }
  if (answered > 0) {
    parts.push(`Casos prácticos: ${correct}/${TCC_ACTIVACION_QUIZ.length} aciertos`);
  }
  if (d.weekly_plan?.trim()) {
    parts.push(`Actividades semanales: ${d.weekly_plan.trim()}`);
  }
  return parts.join('\n');
}

export function buildReadableText(moduleType, data) {
  const d = data || {};
  switch (moduleType) {
    case 'registro_inicial':
      return linesFromObject(d, [
        { key: 'nombre', label: 'Nombre' },
        { key: 'genero', label: 'Género' },
        { key: 'id_number', label: 'ID' },
        { key: 'birth_date', label: 'Nacimiento' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'address', label: 'Dirección' },
        { key: 'marital_status', label: 'Estado civil' },
        { key: 'prevision', label: 'Previsión' },
        { key: 'source', label: 'Fuente' },
        { key: 'ocupaciones', label: 'Ocupaciones' },
      ]);
    case 'motivo_consulta':
      return [
        d.motivo ? `Motivo: ${d.motivo}` : null,
        d.expectativas ? `Expectativas: ${d.expectativas}` : null,
        d.antecedentes ? `Antecedentes: ${d.antecedentes}` : null,
        d.urgencia ? `Urgencia: ${d.urgencia}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    case 'redes_apoyo': {
      const people = (d.people || []).filter((p) => p.name);
      if (!people.length) return '';
      return people
        .map((p) => {
          const parts = [p.name, p.relation, p.domain].filter(Boolean);
          const note = p.notes ? ` — ${p.notes}` : '';
          return parts.join(' · ') + note;
        })
        .join('\n');
    }
    case 'diagnostico':
      return formatDiagnostico(d);
    case 'neurofeedback':
      return formatNeurofeedback(d);
    case 'bilateral_stimulation':
      return formatBilateral(d);
    case 'tcc_abc':
      return formatTccAbc(d);
    case 'tcc_plan_seguridad':
      return formatTccPlanSeguridad(d);
    case 'tcc_activacion':
      return formatTccActivacion(d);
    case 'tcc_socratico':
    case 'tcc_flexibilidad':
    case 'tcc_probabilidades':
    case 'tcc_sesgos':
    case 'tcc_autoconceptos':
    case 'tcc_preocupaciones':
    case 'tcc_gratitud':
    case 'tcc_estres':
      return formatTccHandoutReadable(moduleType, d);
    case 'dass21':
      return formatDass21(d);
    case 'gad7':
      return formatGad7(d);
    case 'asrs':
      return formatAsrs(d);
    case 'pcl5':
      return formatPcl5(d);
    case 'sprint_ecl':
      return formatSprintEcl(d);
    case 'iesr':
      return formatIesr(d);
    case 'ades':
      return formatAdes(d);
    case 'rosenberg':
      return formatRosenberg(d);
    case 'qols':
      return formatAnswersTotal(d.answers, 'Total QOLS', 112);
    case 'eed':
      return formatAnswersTotal(d.answers, 'Perfil EED (suma ítems)', null);
    case 'escala_fer':
      return formatAnswersTotal(d.answers, 'EFR (suma ítems)', 48);
    case 'escala_animo':
      return d.value != null && d.value !== '' ? `Ánimo subjetivo: ${d.value}/100` : '';
    case 'escala_ansiedad':
      return d.value != null && d.value !== '' ? `Ansiedad subjetiva: ${d.value}/100` : '';
    default:
      return '';
  }
}

/** Texto plano del módulo para contexto de IA (futuro). */
export async function syncModuleReadableText(moduleRow, payload, status) {
  const prev = parseJsonSafe(moduleRow.data, {});
  const merged = { ...prev, ...payload };
  const readable = buildReadableText(moduleRow.module_type, merged);
  const label = MODULE_DEFS[moduleRow.module_type]?.label || moduleRow.module_type;
  const header = `# ${label}\n`;
  merged.readable_text = readable ? `${header}${readable}` : header;
  await saveModuleData(moduleRow.id, merged, status || moduleRow.status || 'pendiente');
  return merged;
}
