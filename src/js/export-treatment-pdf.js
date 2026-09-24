import { coverageLabel, idSpecFor } from './clinic-country.js';
import { TREATMENT_STATUS, patientGenderLabel } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { getSessionsWithModules, getTreatment } from './db.js';
import { buildPsychometricSummaryBlock } from './psychometric-summary.js';
import { buildReadableText } from './readable-text.js';
import { loadProfile } from './profile.js';
import {
  dxItemTexts,
  ensurePdfSpace,
  PDF_FONT_FAMILY,
  PDF_MARGIN as MARGIN,
  PDF_MAX_W as MAX_W,
  pdfText,
} from './pdf-utils.js';
import { captureScoreChartImages } from './components/workspace-scores.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';
import { appendCaseStudyPdf } from './export-case-study-pdf.js';

const MODULES_NAME_ONLY = new Set(['diagnostico']);

function stripMarkdownHeaders(text) {
  return String(text || '')
    .replace(/^#\s+.+\n?/gm, '')
    .trim();
}

function moduleSummary(type, data) {
  if (MODULES_NAME_ONLY.has(type)) return '';
  const d = data || {};
  const built = buildReadableText(type, d);
  if (built) return stripMarkdownHeaders(built);

  switch (type) {
    case 'redes_apoyo': {
      const people = (d.people || []).filter((p) => p.name);
      if (!people.length) return 'Sin personas registradas.';
      return people
        .map((p) => {
          const parts = [p.name, p.relation, p.domain].filter(Boolean);
          const note = p.notes ? ` — ${p.notes}` : '';
          return parts.join(' · ') + note;
        })
        .join('\n');
    }
    case 'dass21': {
      const answers = d.answers || [];
      if (!answers.some((v) => v !== null && v !== '')) return 'Sin respuestas.';
      const sum = (idx) => idx.reduce((a, i) => a + (Number(answers[i]) || 0), 0) * 2;
      const stress = sum([0, 5, 7, 10, 11, 13, 17]);
      const anxiety = sum([1, 3, 6, 8, 14, 18, 19]);
      const depression = sum([2, 4, 9, 12, 15, 16, 20]);
      return `Estrés: ${stress} · Ansiedad: ${anxiety} · Depresión: ${depression}`;
    }
    case 'gad7': {
      const answers = d.answers || [];
      if (!answers.some((v) => v !== null && v !== '')) return 'Sin respuestas.';
      const total = answers.reduce((a, v) => a + (Number(v) || 0), 0);
      return `GAD-7 total: ${total}/21`;
    }
    case 'escala_animo': {
      const n = d.mood_score ?? d.value;
      return n != null && n !== '' ? `Puntaje: ${n}/100` : 'Sin puntaje.';
    }
    case 'escala_ansiedad': {
      const n = d.anxiety_score ?? d.value;
      return n != null && n !== '' ? `Puntaje: ${n}/100` : 'Sin puntaje.';
    }
    default:
      if (d.readable_text) return stripMarkdownHeaders(d.readable_text);
      return '';
  }
}

function patientFromSessions(sessions) {
  for (const s of sessions) {
    const reg = s.modules.find((m) => m.module_type === 'registro_inicial');
    if (reg) return parseJsonSafe(reg.data, {});
  }
  return {};
}

const MOTIVO_PDF_FIELDS = [
  ['motivo', 'Motivo principal'],
  ['expectativas', 'Expectativas del tratamiento'],
  ['antecedentes', 'Antecedentes relevantes'],
  ['tratamientos_previos', 'Tratamientos previos'],
  ['medicacion', 'Medicación'],
  ['psiquiatra', 'Psiquiatra / médico tratante'],
  ['consumo', 'Consumo de sustancias'],
  ['relacion_ia', 'Relación con la IA'],
  ['urgencia', 'Urgencia'],
];

function motivoIaValue(data) {
  const direct = String(data.relacion_ia || '').trim();
  if (direct) return direct;
  const prompts = [
    ['¿Qué preguntaste?', data.ia_pregunto],
    ['¿Qué compartiste?', data.ia_compartio],
    ['¿Qué te respondió?', data.ia_respondio],
    ['¿Qué hiciste con eso?', data.ia_hizo],
    ['¿Qué lugar ocupa ahora?', data.ia_lugar],
  ];
  return prompts
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => `${label}\n${String(value).trim()}`)
    .join('\n\n');
}

export function motivoPdfFields(data = {}) {
  return MOTIVO_PDF_FIELDS
    .map(([key, label]) => [label, key === 'relacion_ia' ? motivoIaValue(data) : data[key]])
    .map(([label, value]) => [label, String(value || '').trim()])
    .filter(([, value]) => value);
}

function motivoFromSessions(sessions) {
  for (const session of sessions) {
    const module = session.modules.find((item) => item.module_type === 'motivo_consulta');
    if (module) return parseJsonSafe(module.data, {});
  }
  return {};
}

function renderMotivoBlock(doc, y, data) {
  const fields = motivoPdfFields(data);
  if (!fields.length) return y;

  y += 8;
  y = ensurePdfSpace(doc, y, 24);
  y = pdfText(doc, 'Información clínica inicial', MARGIN, y, { size: 12, style: 'bold' });
  y += 3;
  for (const [label, value] of fields) {
    y = ensurePdfSpace(doc, y, 16);
    y = pdfText(doc, label, MARGIN, y, { size: 9, style: 'bold' });
    y = pdfText(doc, value, MARGIN + 4, y, { size: 9, maxWidth: MAX_W - 4 });
    y += 2;
  }
  return y;
}

function renderDiagnosticoBlock(doc, y, data) {
  const d = data || {};
  const structured = d.structured || {};
  const structFields = [
    ['hipotesis', 'Hipótesis'],
    ['factores_mantenedores', 'Factores mantenedores'],
    ['recursos', 'Recursos'],
    ['comorbidities', 'Comorbilidades'],
    ['trauma_events', 'Eventos traumáticos / antecedentes'],
    ['medication', 'Medicación psicotrópica'],
    ['dx_notes', 'Notas clínicas'],
  ];
  for (const [key, label] of structFields) {
    const val = structured[key]?.trim?.() || structured[key];
    if (!val) continue;
    y = ensurePdfSpace(doc, y, 14);
    y = pdfText(doc, label, MARGIN, y, { size: 9, style: 'bold' });
    y = pdfText(doc, val, MARGIN + 4, y, { size: 9, maxWidth: MAX_W - 4 });
    y += 2;
  }

  const custom = d.custom_diagnosis?.trim();
  if (custom) {
    y = ensurePdfSpace(doc, y, 14);
    y = pdfText(doc, 'Diagnóstico personalizado', MARGIN, y, { size: 9, style: 'bold' });
    y = pdfText(doc, custom, MARGIN + 4, y, { size: 9, maxWidth: MAX_W - 4 });
    y += 2;
  }

  const problems = (d.problems || []).filter((p) => p.assigned && p.name);
  for (const p of problems) {
    y = ensurePdfSpace(doc, y, 20);
    y = pdfText(doc, p.name, MARGIN, y, { size: 10, style: 'bold' });
    y += 1;

    const indicators = dxItemTexts(p.indicators);
    if (indicators.length) {
      y = pdfText(doc, 'Indicadores', MARGIN + 4, y, { size: 9, style: 'bold' });
      for (const line of indicators) {
        y = pdfText(doc, `• ${line}`, MARGIN + 8, y, { size: 9, maxWidth: MAX_W - 8 });
      }
      y += 1;
    }

    const objectives = dxItemTexts(p.objectives);
    if (objectives.length) {
      y = pdfText(doc, 'Objetivos', MARGIN + 4, y, { size: 9, style: 'bold' });
      for (const line of objectives) {
        y = pdfText(doc, `• ${line}`, MARGIN + 8, y, { size: 9, maxWidth: MAX_W - 8 });
      }
      y += 1;
    }
    y += 2;
  }

  return y;
}

function hasDiagnosticoContent(data) {
  const d = data || {};
  if (d.custom_diagnosis?.trim()) return true;
  const structured = d.structured || {};
  if (Object.values(structured).some((v) => String(v || '').trim())) return true;
  return (d.problems || []).some((p) => p.assigned && p.name);
}

export async function exportTreatmentPdf(treatmentId) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('Biblioteca PDF no disponible. Recarga la aplicación.');

  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');

  const sessions = await getSessionsWithModules(treatmentId);
  const profile = loadProfile();
  const patient = patientFromSessions(sessions);
  const statusLabel = TREATMENT_STATUS[treatment.status]?.label || treatment.status || '—';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  y = pdfText(doc, 'Programa de tratamiento', MARGIN, y, { size: 14, style: 'bold' });
  y += 4;
  y = pdfText(doc, `Generado: ${formatDate(new Date().toISOString())}`, MARGIN, y, { size: 9 });
  if (profile.name) y = pdfText(doc, `Profesional: ${profile.name}`, MARGIN, y, { size: 9 });
  y += 6;

  y = ensurePdfSpace(doc, y, 30);
  y = pdfText(doc, 'Datos del paciente', MARGIN, y, { size: 12, style: 'bold' });
  y += 2;
  const patientLines = [
    ['Nombre', patient.nombre || treatment.patient_name],
    [idSpecFor().shortLabel, patient.id_number],
    ['Nacimiento', patient.birth_date],
    ['Género', patientGenderLabel(patient.genero) || patient.genero],
    ['Email', patient.email],
    ['Teléfono', patient.phone],
    ['Dirección', patient.address],
    ['Estado civil', patient.marital_status],
    [coverageLabel(), patient.prevision],
    ['Fuente', patient.source],
    ['Tratamiento n.º', treatment.number],
    ['Estado', statusLabel],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  y = pdfText(doc, patientLines || treatment.patient_name, MARGIN, y);

  // El contexto clínico debe preceder al diagnóstico y al análisis por ejes.
  y = renderMotivoBlock(doc, y, motivoFromSessions(sessions));

  const dxEntries = [];
  for (const session of sessions) {
    for (const mod of session.modules) {
      if (mod.module_type !== 'diagnostico') continue;
      const data = parseJsonSafe(mod.data, {});
      if (hasDiagnosticoContent(data)) dxEntries.push({ sessionNumber: session.number, data });
    }
  }
  if (dxEntries.length) {
    y += 8;
    y = ensurePdfSpace(doc, y, 24);
    y = pdfText(doc, 'Diagnósticos', MARGIN, y, { size: 12, style: 'bold' });
    y += 4;
    for (const entry of dxEntries) {
      y = ensurePdfSpace(doc, y, 16);
      if (dxEntries.length > 1) {
        y = pdfText(doc, `Sesión ${entry.sessionNumber}`, MARGIN, y, { size: 10, style: 'bold' });
        y += 2;
      }
      y = renderDiagnosticoBlock(doc, y, entry.data);
    }
  }

  y = await appendCaseStudyPdf(doc, y, treatmentId, sessions);

  const psychBlock = buildPsychometricSummaryBlock(sessions);
  if (psychBlock) {
    y += 8;
    y = ensurePdfSpace(doc, y, 24);
    y = pdfText(doc, 'Resumen psicométrico', MARGIN, y, { size: 12, style: 'bold' });
    y += 2;
    y = pdfText(doc, psychBlock, MARGIN, y, { size: 9 });
  }

  y += 8;
  y = ensurePdfSpace(doc, y, 20);
  y = pdfText(doc, 'Sesiones y módulos', MARGIN, y, { size: 12, style: 'bold' });
  y += 4;

  for (const session of sessions) {
    y = ensurePdfSpace(doc, y, 16);
    y = pdfText(doc, `Sesión ${session.number}`, MARGIN, y, { size: 11, style: 'bold' });
    y += 2;

    const mods = session.modules.filter(
      (m) =>
        !['selector_modulo', 'diagnostico', 'registro_inicial', 'motivo_consulta'].includes(
          m.module_type,
        ),
    );
    if (!mods.length) {
      y = pdfText(doc, 'Sin módulos registrados.', MARGIN + 4, y, { size: 9 });
      y += 4;
      continue;
    }

    for (const mod of mods) {
      y = ensurePdfSpace(doc, y, 14);
      const label = moduleLabelFor(mod.module_type);
      const data = parseJsonSafe(mod.data, {});
      const summary = moduleSummary(mod.module_type, data);
      y = pdfText(doc, `• ${label}`, MARGIN + 4, y, {
        size: 10,
        style: 'bold',
      });
      if (summary) {
        y = pdfText(doc, summary, MARGIN + 8, y, { size: 9, maxWidth: MAX_W - 8 });
      }
      y += 2;
    }
    y += 2;
  }

  let chartImages = [];
  try {
    chartImages = await captureScoreChartImages(sessions);
  } catch {
    chartImages = [];
  }
  if (chartImages.length) {
    y += 8;
    y = ensurePdfSpace(doc, y, 28);
    y = pdfText(doc, 'Evolución de puntajes', MARGIN, y, { size: 12, style: 'bold' });
    y += 2;
    const imgH = 58;
    for (const img of chartImages) {
      y = ensurePdfSpace(doc, y, imgH + 14);
      y = pdfText(doc, img.title, MARGIN, y, { size: 10, style: 'bold', maxWidth: MAX_W });
      y += 2;
      doc.addImage(img.dataUrl, 'PNG', MARGIN, y, MAX_W, imgH);
      y += imgH + 8;
    }
  }


  const safeName = (treatment.patient_name || 'paciente').replace(/[^\w\s-áéíóúñ]/gi, '').trim();
  const filename = `programa-tratamiento-${safeName || 'paciente'}.pdf`;

  if (isTauriApp()) {
    const bytes = doc.output('arraybuffer');
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new Uint8Array(bytes)),
      destination: 'desktop',
    });
    return filename;
  }

  doc.save(filename);
  return filename;
}
