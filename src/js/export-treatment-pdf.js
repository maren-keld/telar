import { TREATMENT_STATUS } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { getSessionsWithModules, getTreatment, getTreatmentReport } from './db.js';
import { buildPsychometricSummaryBlock } from './psychometric-summary.js';
import { buildReadableText } from './readable-text.js';
import { loadProfile } from './profile.js';
import {
  dxItemTexts,
  ensurePdfSpace,
  PDF_MARGIN as MARGIN,
  PDF_MAX_W as MAX_W,
  pdfText,
} from './pdf-utils.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';

const MODULES_NAME_ONLY = new Set(['motivo_consulta', 'diagnostico']);

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
    case 'escala_animo':
    case 'escala_ansiedad':
      return d.value != null ? `Puntaje: ${d.value}/100` : 'Sin puntaje.';
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

function renderDiagnosticoBlock(doc, y, data) {
  const d = data || {};
  const structured = d.structured || {};
  const structFields = [
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
  const nfRecordings = await getTreatmentReport(treatmentId);
  const profile = loadProfile();
  const patient = patientFromSessions(sessions);
  const statusLabel = TREATMENT_STATUS[treatment.status]?.label || treatment.status || '—';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  y = pdfText(doc, 'Programa de tratamiento — Telar', MARGIN, y, { size: 14, style: 'bold' });
  y += 4;
  y = pdfText(doc, `Generado: ${formatDate(new Date().toISOString())}`, MARGIN, y, { size: 9 });
  if (profile.name) y = pdfText(doc, `Profesional: ${profile.name}`, MARGIN, y, { size: 9 });
  y += 6;

  y = ensurePdfSpace(doc, y, 30);
  y = pdfText(doc, 'Datos del paciente', MARGIN, y, { size: 12, style: 'bold' });
  y += 2;
  const patientLines = [
    ['Nombre', patient.nombre || treatment.patient_name],
    ['RUT/ID', patient.id_number],
    ['Nacimiento', patient.birth_date],
    ['Género', patient.genero],
    ['Email', patient.email],
    ['Teléfono', patient.phone],
    ['Dirección', patient.address],
    ['Estado civil', patient.marital_status],
    ['Previsión', patient.prevision],
    ['Fuente', patient.source],
    ['Tratamiento n.º', treatment.number],
    ['Estado', statusLabel],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  y = pdfText(doc, patientLines || treatment.patient_name, MARGIN, y);

  const motivo = sessions
    .flatMap((s) => s.modules)
    .find((m) => m.module_type === 'motivo_consulta');
  if (motivo) {
    const md = parseJsonSafe(motivo.data, {});
    y += 6;
    y = ensurePdfSpace(doc, y, 20);
    y = pdfText(doc, 'Motivo de consulta', MARGIN, y, { size: 12, style: 'bold' });
    y += 2;
    y = pdfText(doc, moduleSummary('motivo_consulta', md) || buildReadableText('motivo_consulta', md) || '—', MARGIN, y);
  }

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

  const psychBlock = buildPsychometricSummaryBlock(sessions);
  if (psychBlock) {
    y += 8;
    y = ensurePdfSpace(doc, y, 24);
    y = pdfText(doc, 'Resumen psicométrico (TDAH / trauma)', MARGIN, y, { size: 12, style: 'bold' });
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
        m.module_type !== 'selector_modulo' &&
        m.module_type !== 'registro_inicial' &&
        m.module_type !== 'motivo_consulta' &&
        m.module_type !== 'diagnostico',
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

  if (nfRecordings.length) {
    y += 4;
    y = ensurePdfSpace(doc, y, 20);
    y = pdfText(doc, 'Resultados neurofeedback', MARGIN, y, { size: 12, style: 'bold' });
    y += 4;
    for (const r of nfRecordings) {
      y = ensurePdfSpace(doc, y, 12);
      const res = parseJsonSafe(r.results_json, {});
      const line = [
        `Sesión ${r.session_number}`,
        r.protocol,
        formatDate(r.started_at),
        res.relaxation_pct != null ? `Relajación ${res.relaxation_pct}%` : null,
        res.calm_pct != null ? `Calma ${res.calm_pct}%` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      y = pdfText(doc, line, MARGIN + 4, y, { size: 9 });
    }
  }

  const safeName = (treatment.patient_name || 'paciente').replace(/[^\w\s-áéíóúñ]/gi, '').trim();
  const filename = `programa-tratamiento-${safeName || 'paciente'}.pdf`;

  if (isTauriApp()) {
    const bytes = doc.output('arraybuffer');
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new Uint8Array(bytes)),
    });
    return filename;
  }

  doc.save(filename);
  return filename;
}
