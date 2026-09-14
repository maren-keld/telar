import { CASE_STUDY_AXES, statusLabelFor, SUPPORT_NETWORK_KIND } from './case-study-model.js';
import { loadCaseStudy } from './case-study-store.js';
import { dxItemTexts, ensurePdfSpace, PDF_MARGIN as MARGIN, PDF_MAX_W as MAX_W, pdfText } from './pdf-utils.js';

function listLines(items) {
  return dxItemTexts(items).filter(Boolean);
}

const AXIS_TONES = {
  problem: [198, 40, 40],
  resource: [46, 125, 50],
  defense: [183, 148, 26],
  risk: [211, 164, 24],
  other: [116, 134, 161],
};

function axisHeader(doc, y, axis) {
  const [r, g, b] = AXIS_TONES[axis.id] || AXIS_TONES.other;
  doc.setFillColor(245, 247, 251);
  doc.roundedRect(MARGIN, y - 5, MAX_W, 10, 2, 2, 'F');
  doc.setFillColor(r, g, b);
  doc.circle(MARGIN + 5, y, 2.2, 'F');
  return pdfText(doc, axis.label, MARGIN + 10, y + 1.6, { size: 10.5, style: 'bold' });
}

function elementPill(doc, y, axis, title, status) {
  const [r, g, b] = AXIS_TONES[axis.id] || AXIS_TONES.other;
  const label = statusLabelFor(axis.id, status || 'unknown');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const titleWidth = Math.min(MAX_W - 50, doc.getTextWidth(title) + 10);
  doc.setFillColor(239, 243, 250);
  doc.roundedRect(MARGIN + 2, y - 4.7, titleWidth, 8, 3, 3, 'F');
  doc.setFillColor(r, g, b);
  doc.circle(MARGIN + 6, y - 0.7, 1.55, 'F');
  doc.setTextColor(27, 45, 76);
  doc.text(title, MARGIN + 10, y + 1.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(105, 120, 145);
  doc.text(label, MARGIN + titleWidth + 6, y + 1.1);
  doc.setTextColor(0, 0, 0);
  return y + 7;
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
    y = ensurePdfSpace(doc, y, 18);
    y = axisHeader(doc, y, axis);
    y += 3;
    for (const el of rows) {
      y = ensurePdfSpace(doc, y, 18);
      const title = el.title || 'Elemento';
      y = elementPill(doc, y, axis, title, el.status);
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
