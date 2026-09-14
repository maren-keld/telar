import { CASE_STUDY_AXES, STATUS_LABELS, SUPPORT_NETWORK_KIND } from './case-study-model.js';
import { loadCaseStudy } from './case-study-store.js';
import { dxItemTexts, ensurePdfSpace, PDF_MARGIN as MARGIN, PDF_MAX_W as MAX_W, pdfText } from './pdf-utils.js';

function listLines(items) {
  return dxItemTexts(items).filter(Boolean);
}

export function renderCaseStudyPdfBlock(doc, y, caseStudy) {
  const elements = caseStudy?.elements || [];
  if (!elements.some((el) => el.title || el.kind === SUPPORT_NETWORK_KIND)) return y;

  y += 8;
  y = ensurePdfSpace(doc, y, 20);
  y = pdfText(doc, 'Estudio de caso', MARGIN, y, { size: 12, style: 'bold' });
  y += 4;

  for (const axis of CASE_STUDY_AXES) {
    const rows = elements.filter((el) => el.axis === axis.id && (el.title || el.kind === SUPPORT_NETWORK_KIND));
    if (!rows.length) continue;
    y = ensurePdfSpace(doc, y, 16);
    y = pdfText(doc, axis.label, MARGIN, y, { size: 11, style: 'bold' });
    y += 2;
    for (const el of rows) {
      y = ensurePdfSpace(doc, y, 16);
      const status = STATUS_LABELS[el.status] || el.status || '';
      const title = el.title || 'Elemento';
      y = pdfText(doc, status ? `${title} (${status})` : title, MARGIN + 2, y, { size: 10, style: 'bold' });
      if (el.notes) {
        y = pdfText(doc, el.notes, MARGIN + 6, y, { size: 9, maxWidth: MAX_W - 6 });
      }
      const blocks = [
        ['Manifestaciones', listLines(el.manifestations)],
        ['Indicadores', listLines(el.indicators)],
        ['Objetivos', listLines(el.objectives)],
        ['Evidencia', listLines(el.evidence)],
      ];
      for (const [label, lines] of blocks) {
        if (!lines.length) continue;
        y = pdfText(doc, label, MARGIN + 6, y, { size: 9, style: 'bold' });
        for (const line of lines) {
          y = pdfText(doc, `• ${line}`, MARGIN + 10, y, { size: 9, maxWidth: MAX_W - 10 });
        }
        y += 1;
      }
      if (el.kind === SUPPORT_NETWORK_KIND) {
        const people = (el.people || []).filter((p) => p.name);
        if (people.length) {
          y = pdfText(doc, 'Personas', MARGIN + 6, y, { size: 9, style: 'bold' });
          for (const p of people) {
            const parts = [p.name, p.relation, p.domain].filter(Boolean);
            const note = p.notes ? ` — ${p.notes}` : '';
            y = pdfText(doc, `• ${parts.join(' · ')}${note}`, MARGIN + 10, y, {
              size: 9,
              maxWidth: MAX_W - 10,
            });
          }
          y += 1;
        }
      }
      y += 2;
    }
  }
  return y;
}

export async function appendCaseStudyPdf(doc, y, treatmentId) {
  try {
    const caseStudy = await loadCaseStudy(treatmentId);
    return renderCaseStudyPdfBlock(doc, y, caseStudy);
  } catch {
    return y;
  }
}
