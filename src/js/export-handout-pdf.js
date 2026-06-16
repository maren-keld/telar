/** PDF de handouts / módulos TCC individuales. */

import { tccHandoutDef } from './tcc-handout-defs.js';
import { ensurePdfSpace, PDF_MARGIN as MARGIN, pdfText } from './pdf-utils.js';

export function renderHandoutPdf(doc, { def, data, patientName, startY = 20 } = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - MARGIN * 2;
  let y = startY;

  y = pdfText(doc, def.title, MARGIN, y, { size: 15, style: 'bold' });
  y += 2;

  if (patientName) {
    doc.setTextColor(120);
    y = pdfText(doc, patientName, MARGIN, y, { size: 9 });
    doc.setTextColor(0);
    y += 2;
  }

  if (def.intro) {
    y = pdfText(doc, def.intro, MARGIN, y, { size: 9, maxWidth: maxW });
    y += 4;
  }

  const d = data || {};
  let hasContent = false;

  for (const section of def.sections || []) {
    const raw = d[section.key];
    const text = raw == null || raw === '' ? null : String(raw).trim();
    y = ensurePdfSpace(doc, y, 18);
    y = pdfText(doc, section.title, MARGIN, y, { size: 11, style: 'bold' });
    if (section.hint) {
      y = pdfText(doc, section.hint, MARGIN, y, { size: 8, maxWidth: maxW });
      y += 1;
    }
    if (text) {
      hasContent = true;
      y = pdfText(doc, text, MARGIN, y, { size: 10, maxWidth: maxW });
    } else {
      y = pdfText(doc, '(Sin respuesta)', MARGIN, y, { size: 9 });
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
      if (v == null || v === '') return;
      answered += 1;
      const opt = q.options.find((o) => o.v === v);
      if (opt?.correct) correct += 1;
      y = ensurePdfSpace(doc, y, 16);
      y = pdfText(doc, `${qi + 1}. ${q.prompt}`, MARGIN, y, { size: 9, maxWidth: maxW });
      y = pdfText(doc, `Respuesta: ${opt?.label || v}`, MARGIN + 4, y, { size: 9, maxWidth: maxW - 4 });
      y += 2;
    });
    if (answered > 0) {
      hasContent = true;
      y = pdfText(doc, `Aciertos: ${correct}/${quizKeys.length}`, MARGIN, y, { size: 9, style: 'bold' });
    } else {
      y = pdfText(doc, '(Sin respuestas)', MARGIN, y, { size: 9 });
    }
  }

  if (!hasContent && !(def.sections || []).length) {
    y = pdfText(doc, 'Sin contenido registrado en este módulo.', MARGIN, y, { size: 9 });
  }

  return y;
}

export function handoutPdfFilename(def, patientName) {
  const safe = (patientName || 'paciente').replace(/[^\w\s-]/gi, '').trim() || 'paciente';
  const slug = def.title.replace(/\s+/g, '-').toLowerCase();
  return `${slug}-${safe}.pdf`;
}
