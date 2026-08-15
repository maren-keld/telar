/** PDF de handouts / módulos TCC individuales. */

import { tccHandoutDef } from './tcc-handout-defs.js';
import { ensurePdfSpace, PDF_MARGIN as MARGIN, pdfText } from './pdf-utils.js';

const PLACEHOLDER_NAMES = new Set(['', 'paciente sin nombre', 'sin nombre', 'paciente']);

function displayPatientName(raw) {
  const name = String(raw || '').trim();
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) return null;
  return name;
}

/** Recuadro vacío para responder a mano al imprimir. */
function drawAnswerBox(doc, x, y, w, h = 28) {
  doc.setDrawColor(40);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, h);
  // Líneas guía internas
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  const lineGap = 7;
  for (let ly = y + lineGap; ly < y + h - 2; ly += lineGap) {
    doc.line(x + 3, ly, x + w - 3, ly);
  }
  doc.setDrawColor(0);
  return y + h;
}

export function renderHandoutPdf(doc, { def, data, patientName, startY = 20 } = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - MARGIN * 2;
  let y = startY;

  y = pdfText(doc, def.title, MARGIN, y, { size: 15, style: 'bold' });
  y += 2;

  const shownName = displayPatientName(patientName);
  if (shownName) {
    doc.setTextColor(120);
    y = pdfText(doc, shownName, MARGIN, y, { size: 9 });
    doc.setTextColor(0);
    y += 2;
  }

  if (def.intro) {
    y = pdfText(doc, def.intro, MARGIN, y, { size: 9, maxWidth: maxW });
    y += 4;
  }

  const d = data || {};
  let hasContent = false;

  // Listas fijas de actividades (estrés, activación, etc.)
  for (const group of def.activityGroups || []) {
    y = ensurePdfSpace(doc, y, 20);
    y = pdfText(doc, group.title, MARGIN, y, { size: 11, style: 'bold' });
    y += 1;
    for (const item of group.items || []) {
      y = ensurePdfSpace(doc, y, 12);
      y = pdfText(doc, `• ${item}`, MARGIN, y, { size: 9, maxWidth: maxW });
      y += 1;
    }
    y += 3;
    hasContent = true;
  }

  for (const section of def.sections || []) {
    const raw = d[section.key];
    const text = raw == null || raw === '' ? null : String(raw).trim();
    const boxH = Math.max(28, (section.rows || 3) * 7);
    y = ensurePdfSpace(doc, y, 18 + (text ? 12 : boxH));
    y = pdfText(doc, section.title, MARGIN, y, { size: 11, style: 'bold' });
    if (section.hint) {
      y = pdfText(doc, section.hint, MARGIN, y, { size: 8, maxWidth: maxW });
      y += 1;
    }
    if (text) {
      hasContent = true;
      y = pdfText(doc, text, MARGIN, y, { size: 10, maxWidth: maxW });
    } else {
      y = drawAnswerBox(doc, MARGIN, y, maxW, boxH);
    }
    y += 4;
  }

  const quiz = d.quiz || {};
  const quizKeys = def.quiz || [];
  if (quizKeys.length) {
    y = ensurePdfSpace(doc, y, 18);
    y = pdfText(doc, 'Casos prácticos', MARGIN, y, { size: 11, style: 'bold' });
    y += 2;
    let answered = 0;
    let correct = 0;
    quizKeys.forEach((q, qi) => {
      const v = quiz[q.key];
      y = ensurePdfSpace(doc, y, 36);
      y = pdfText(doc, `${qi + 1}. ${q.prompt}`, MARGIN, y, { size: 9, maxWidth: maxW });
      y += 4;
      if (v == null || v === '') {
        y = drawAnswerBox(doc, MARGIN, y, maxW, 22);
        y += 10;
        return;
      }
      answered += 1;
      const opt = q.options.find((o) => o.v === v);
      if (opt?.correct) correct += 1;
      y = pdfText(doc, `Respuesta: ${opt?.label || v}`, MARGIN + 4, y, { size: 9, maxWidth: maxW - 4 });
      y += 6;
    });
    if (answered > 0) {
      hasContent = true;
      y = pdfText(doc, `Aciertos: ${correct}/${quizKeys.length}`, MARGIN, y, { size: 9, style: 'bold' });
    }
  }

  if (!hasContent && !(def.sections || []).length && !(def.activityGroups || []).length) {
    y = pdfText(doc, 'Sin contenido registrado en este módulo.', MARGIN, y, { size: 9 });
  }

  return y;
}

export function handoutPdfFilename(def, patientName) {
  const shown = displayPatientName(patientName);
  const safe = (shown || 'paciente').replace(/[^\w\s-]/gi, '').trim() || 'paciente';
  const slug = def.title.replace(/\s+/g, '-').toLowerCase();
  return `${slug}-${safe}.pdf`;
}
