import { TREATMENT_STATUS } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { getSessionsWithModules, getTreatment, getTreatmentReport } from './db.js';
import { buildReadableText } from './readable-text.js';
import { loadProfile } from './profile.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';

const MARGIN = 18;
const LINE = 5.5;
const PAGE_W = 210;
const MAX_W = PAGE_W - MARGIN * 2;

function pdfText(doc, text, x, y, { maxWidth = MAX_W, size = 10, style = 'normal' } = {}) {
  doc.setFontSize(size);
  doc.setFont('helvetica', style);
  const lines = doc.splitTextToSize(String(text || ''), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.42);
}

function ensureSpace(doc, y, needed = 20) {
  if (y + needed > 280) {
    doc.addPage();
    return MARGIN + 8;
  }
  return y;
}

function stripMarkdownHeaders(text) {
  return String(text || '')
    .replace(/^#\s+.+\n?/gm, '')
    .trim();
}

function moduleSummary(type, data) {
  const d = data || {};
  const built = buildReadableText(type, d);
  if (built) return stripMarkdownHeaders(built);

  switch (type) {
    case 'diagnostico': {
      const problems = (d.problems || []).filter((p) => p.assigned && p.name);
      if (!problems.length) return 'Sin diagnósticos asignados.';
      return problems
        .map((p) => {
          const ind = (p.indicators || []).filter(Boolean).join('; ');
          const obj = (p.objectives || []).filter(Boolean).join('; ');
          return [p.name, ind ? `Indicadores: ${ind}` : null, obj ? `Objetivos: ${obj}` : null]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n');
    }
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

  y = ensureSpace(doc, y, 30);
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
    y = ensureSpace(doc, y, 20);
    y = pdfText(doc, 'Motivo de consulta', MARGIN, y, { size: 12, style: 'bold' });
    y += 2;
    y = pdfText(doc, moduleSummary('motivo_consulta', md), MARGIN, y);
  }

  y += 8;
  y = ensureSpace(doc, y, 20);
  y = pdfText(doc, 'Sesiones y módulos', MARGIN, y, { size: 12, style: 'bold' });
  y += 4;

  for (const session of sessions) {
    y = ensureSpace(doc, y, 16);
    y = pdfText(doc, `Sesión ${session.number}`, MARGIN, y, { size: 11, style: 'bold' });
    y += 2;

    const mods = session.modules.filter((m) => m.module_type !== 'selector_modulo');
    if (!mods.length) {
      y = pdfText(doc, 'Sin módulos registrados.', MARGIN + 4, y, { size: 9 });
      y += 4;
      continue;
    }

    for (const mod of mods) {
      y = ensureSpace(doc, y, 14);
      const label = moduleLabelFor(mod.module_type);
      const data = parseJsonSafe(mod.data, {});
      const summary = moduleSummary(mod.module_type, data);
      y = pdfText(doc, `• ${label} (${mod.status || 'pendiente'})`, MARGIN + 4, y, {
        size: 10,
        style: 'bold',
      });
      if (summary) {
        y = pdfText(doc, summary, MARGIN + 8, y, { size: 9 });
      }
      y += 2;
    }
    y += 2;
  }

  if (nfRecordings.length) {
    y += 4;
    y = ensureSpace(doc, y, 20);
    y = pdfText(doc, 'Resultados neurofeedback', MARGIN, y, { size: 12, style: 'bold' });
    y += 4;
    for (const r of nfRecordings) {
      y = ensureSpace(doc, y, 12);
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
