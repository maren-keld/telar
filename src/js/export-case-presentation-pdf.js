/**
 * Presentación de caso para supervisión.
 *
 * A diferencia de `export-treatment-pdf.js` (programa completo e identificado,
 * pensado para la ficha y para el paciente), este documento está hecho para salir
 * de la consulta: va a un supervisor, a un equipo o a una reunión clínica.
 *
 * Por eso es SIEMPRE anónimo. No incluye nombre, RUT, contacto ni dirección —
 * tampoco en el nombre del archivo, que es donde más se filtra al enviarlo por
 * correo o WhatsApp. El caso se identifica con el código opaco `TL-XXXX`, que el
 * clínico resuelve dentro de Telar.
 *
 * El contenido sigue el formato habitual de presentación: contexto, motivo,
 * hipótesis, evolución psicométrica (la curva), arco de sesiones, momentos
 * marcados y preguntas a supervisión.
 */
import { TREATMENT_STATUS } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { getClinicalNotes, getSessionsWithModules, getTreatment } from './db.js';
import { psychometricSeries, psychometricChartMeta, psychometricTypes } from './psychometric-summary.js';
import { buildReadableText } from './readable-text.js';
import { caseCode } from './case-code.js';
import { loadProfile } from './profile.js';
import { dxItemTexts, ensurePdfSpace, PDF_MARGIN as MARGIN, PDF_MAX_W as MAX_W, pdfText } from './pdf-utils.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';

/** Módulos que no aportan al arco de sesiones (son estructura, no trabajo clínico). */
const STRUCTURAL_MODULES = new Set(['selector_modulo', 'registro_inicial']);

function stripMarkdownHeaders(text) {
  return String(text || '')
    .replace(/^#\s+.+\n?/gm, '')
    .trim();
}

function registroInicialData(sessions) {
  for (const s of sessions) {
    const reg = s.modules.find((m) => m.module_type === 'registro_inicial');
    if (reg) return parseJsonSafe(reg.data, {});
  }
  return {};
}

/** Edad en años a partir de la fecha de nacimiento; null si no hay dato válido. */
function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function occupationsText(raw) {
  const list = Array.isArray(raw) ? raw : parseJsonSafe(raw, []);
  if (!Array.isArray(list)) return '';
  return list
    .map((o) => (typeof o === 'string' ? o : o?.name || o?.label || ''))
    .filter(Boolean)
    .join(', ');
}

function diagnosticoLines(data) {
  const d = data || {};
  const out = [];
  const structured = d.structured || {};
  for (const [key, label] of [
    ['comorbidities', 'Comorbilidades'],
    ['trauma_events', 'Eventos traumáticos / antecedentes'],
    ['medication', 'Medicación psicotrópica'],
    ['dx_notes', 'Notas clínicas'],
  ]) {
    const val = String(structured[key] ?? '').trim();
    if (val) out.push(`${label}: ${val}`);
  }
  const custom = String(d.custom_diagnosis ?? '').trim();
  if (custom) out.push(`Diagnóstico: ${custom}`);
  for (const p of (d.problems || []).filter((x) => x.assigned && x.name)) {
    const objectives = dxItemTexts(p.objectives);
    out.push(objectives.length ? `${p.name} — objetivos: ${objectives.join('; ')}` : String(p.name));
  }
  return out;
}

/**
 * Arma el modelo de datos del documento. Puro y sin jsPDF para poder testear que
 * no se filtre ningún identificador.
 *
 * @returns {{code:string, context:string[], motivo:string, hipotesis:string[],
 *   series:Array, arc:Array, flagged:string[], questions:string[], meta:object}}
 */
export function buildCasePresentationData({ treatment, sessions, notes = [], profile = {} }) {
  const reg = registroInicialData(sessions);
  const code = caseCode(treatment.id);

  // Contexto: solo variables clínicamente relevantes y no identificatorias.
  // Deliberadamente ausentes: nombre, RUT, email, teléfono, dirección.
  const age = ageFromBirthDate(reg.birth_date || treatment.birth_date);
  const context = [
    age != null ? `Edad: ${age} años` : '',
    reg.genero ? `Género: ${reg.genero}` : '',
    occupationsText(reg.occupations) ? `Ocupación: ${occupationsText(reg.occupations)}` : '',
    reg.marital_status ? `Estado civil: ${reg.marital_status}` : '',
    reg.prevision ? `Previsión: ${reg.prevision}` : '',
    reg.source ? `Derivación: ${reg.source}` : '',
  ].filter(Boolean);

  const motivoMod = sessions.flatMap((s) => s.modules).find((m) => m.module_type === 'motivo_consulta');
  const motivo = motivoMod
    ? stripMarkdownHeaders(buildReadableText('motivo_consulta', parseJsonSafe(motivoMod.data, {})) || '')
    : '';

  const hipotesis = [];
  for (const session of sessions) {
    for (const mod of session.modules) {
      if (mod.module_type !== 'diagnostico') continue;
      hipotesis.push(...diagnosticoLines(parseJsonSafe(mod.data, {})));
    }
  }

  // Evolución psicométrica: solo escalas con al menos dos puntos, que es cuando
  // la curva dice algo. Con un solo punto se reporta como línea de base.
  const series = [];
  for (const type of psychometricTypes()) {
    const points = psychometricSeries(sessions, type);
    if (!points.length) continue;
    const meta = psychometricChartMeta(type);
    const first = points[0];
    const last = points[points.length - 1];
    series.push({
      type,
      title: meta.title,
      yMax: meta.yMax,
      color: meta.color,
      points,
      delta: points.length > 1 ? last.value - first.value : null,
      baseline: first.value,
      current: last.value,
    });
  }

  const arc = sessions.map((s) => ({
    number: s.number,
    modules: s.modules
      .filter((m) => !STRUCTURAL_MODULES.has(m.module_type))
      .map((m) => moduleLabelFor(m.module_type)),
  }));

  // Momentos marcados durante la semana (nota destacada) y preguntas explícitas.
  const flagged = notes
    .filter((n) => Number(n.starred) === 1)
    .map((n) => {
      const quote = String(n.quote_text || '').trim();
      const body = String(n.content || '').trim();
      const where = n.session_id ? `S${n.session_id}` : '';
      return [quote ? `«${quote}»` : '', body, where ? `(${n.source_label || where})` : '']
        .filter(Boolean)
        .join(' — ');
    })
    .filter(Boolean);

  const questions = notes
    .filter((n) => n.kind === 'pregunta_supervision')
    .map((n) => String(n.content || '').trim())
    .filter(Boolean);

  return {
    code,
    context,
    motivo,
    hipotesis,
    series,
    arc,
    flagged,
    questions,
    meta: {
      sessionCount: sessions.length,
      status: TREATMENT_STATUS[treatment.status]?.label || treatment.status || '—',
      treatmentNumber: treatment.number,
      professional: profile.name || '',
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Gráfico de línea compacto para una escala. Dibuja marco, ejes y serie. */
function drawSeriesChart(doc, x, y, w, h, serie) {
  const { points, yMax, color } = serie;
  const rgb = hexToRgb(color);

  doc.setDrawColor(220, 222, 228);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);

  // Referencia horizontal a media escala.
  doc.setDrawColor(238, 240, 244);
  doc.line(x, y + h / 2, x + w, y + h / 2);

  const max = Math.max(yMax || 0, ...points.map((p) => p.value), 1);
  const toXY = (p, i) => {
    const px = points.length === 1 ? x + w / 2 : x + (i * w) / (points.length - 1);
    const py = y + h - (p.value / max) * h;
    return [px, py];
  };

  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.6);
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = toXY(points[i - 1], i - 1);
    const [x2, y2] = toXY(points[i], i);
    doc.line(x1, y1, x2, y2);
  }
  points.forEach((p, i) => {
    const [px, py] = toXY(p, i);
    doc.circle(px, py, 0.7, 'F');
  });

  // Etiquetas de primera y última sesión.
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130, 134, 142);
  doc.text(String(points[0].label), x, y + h + 3);
  if (points.length > 1) {
    doc.text(String(points[points.length - 1].label), x + w - 6, y + h + 3);
  }
  doc.setTextColor(0, 0, 0);
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '#2f6fed'));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [47, 111, 237];
}

function section(doc, y, title) {
  y = ensurePdfSpace(doc, y + 6, 24);
  y = pdfText(doc, title, MARGIN, y, { size: 12, style: 'bold' });
  return y + 2;
}

/** Renderiza el PDF a partir del modelo. Separado para poder testear el modelo. */
function renderCasePdf(data) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('Biblioteca PDF no disponible. Recarga la aplicación.');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  y = pdfText(doc, 'Presentación de caso', MARGIN, y, { size: 16, style: 'bold' });
  y += 3;
  y = pdfText(doc, `Caso ${data.code}`, MARGIN, y, { size: 12, style: 'bold' });
  y += 3;

  const headerBits = [
    `${data.meta.sessionCount} sesiones`,
    data.meta.status,
    data.meta.treatmentNumber > 1 ? `Tratamiento n.º ${data.meta.treatmentNumber}` : '',
    data.meta.professional ? `Profesional: ${data.meta.professional}` : '',
    `Generado: ${formatDate(data.meta.generatedAt)}`,
  ].filter(Boolean);
  y = pdfText(doc, headerBits.join('  ·  '), MARGIN, y, { size: 8.5 });
  y += 2;

  doc.setDrawColor(220, 222, 228);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + MAX_W, y);
  y += 4;

  y = pdfText(
    doc,
    'Documento anonimizado: no contiene nombre, RUT ni datos de contacto. El caso se identifica solo por su código.',
    MARGIN,
    y,
    { size: 8 },
  );

  if (data.context.length) {
    y = section(doc, y, 'Contexto');
    y = pdfText(doc, data.context.join('  ·  '), MARGIN, y, { size: 9.5 });
  }

  if (data.motivo) {
    y = section(doc, y, 'Motivo de consulta');
    y = pdfText(doc, data.motivo, MARGIN, y, { size: 9.5 });
  }

  if (data.hipotesis.length) {
    y = section(doc, y, 'Hipótesis y diagnóstico');
    for (const line of data.hipotesis) {
      y = ensurePdfSpace(doc, y, 12);
      y = pdfText(doc, `• ${line}`, MARGIN, y, { size: 9.5, maxWidth: MAX_W });
      y += 1;
    }
  }

  if (data.series.length) {
    y = section(doc, y, 'Evolución psicométrica');

    // Resumen numérico primero: es lo que el supervisor lee en voz alta.
    for (const s of data.series) {
      y = ensurePdfSpace(doc, y, 10);
      const delta =
        s.delta == null
          ? 'línea de base'
          : `${s.delta > 0 ? '+' : ''}${s.delta} desde el inicio`;
      y = pdfText(doc, `• ${s.title}: ${s.baseline} → ${s.current}  (${delta})`, MARGIN, y, {
        size: 9.5,
      });
    }
    y += 4;

    // Gráficos: dos por fila.
    const chartW = (MAX_W - 10) / 2;
    const chartH = 26;
    for (let i = 0; i < data.series.length; i += 2) {
      y = ensurePdfSpace(doc, y, chartH + 16);
      const row = data.series.slice(i, i + 2);
      row.forEach((s, col) => {
        const x = MARGIN + col * (chartW + 10);
        pdfText(doc, s.title, x, y, { size: 8.5, style: 'bold', maxWidth: chartW });
        drawSeriesChart(doc, x, y + 2, chartW, chartH, s);
      });
      y += chartH + 12;
    }
  }

  if (data.arc.length) {
    y = section(doc, y, 'Trabajo por sesión');
    for (const s of data.arc) {
      y = ensurePdfSpace(doc, y, 10);
      const mods = s.modules.length ? s.modules.join(', ') : 'sin módulos registrados';
      y = pdfText(doc, `S${s.number} · ${mods}`, MARGIN, y, { size: 9, maxWidth: MAX_W });
      y += 0.5;
    }
  }

  if (data.flagged.length) {
    y = section(doc, y, 'Momentos marcados');
    for (const line of data.flagged) {
      y = ensurePdfSpace(doc, y, 12);
      y = pdfText(doc, `• ${line}`, MARGIN, y, { size: 9.5, maxWidth: MAX_W });
      y += 1;
    }
  }

  if (data.questions.length) {
    y = section(doc, y, 'Preguntas a supervisión');
    for (const line of data.questions) {
      y = ensurePdfSpace(doc, y, 12);
      y = pdfText(doc, `• ${line}`, MARGIN, y, { size: 9.5, maxWidth: MAX_W });
      y += 1;
    }
  }

  // Pie en todas las páginas.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 144, 152);
    doc.text(`${data.code}  ·  Generado con Telar — telarapp.cl`, MARGIN, 289);
    doc.text(`${p}/${pages}`, MARGIN + MAX_W - 6, 289);
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}

/**
 * Genera y guarda la presentación de caso.
 * @param {number} treatmentId
 * @returns {Promise<string>} nombre del archivo
 */
export async function exportCasePresentationPdf(treatmentId) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');

  const [sessions, notes] = await Promise.all([
    getSessionsWithModules(treatmentId),
    getClinicalNotes(treatmentId),
  ]);

  const data = buildCasePresentationData({
    treatment,
    sessions,
    notes,
    profile: loadProfile(),
  });

  const doc = renderCasePdf(data);

  // El nombre del archivo también es anónimo: es lo que queda visible al
  // adjuntarlo en un correo o enviarlo por WhatsApp.
  const filename = `presentacion-caso-${data.code}.pdf`;

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
