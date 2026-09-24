import { CASE_STUDY_AXES, statusLabelFor, SUPPORT_NETWORK_KIND } from './case-study-model.js';
import { analysisCategoriesForElement } from './case-study-analysis.js';
import { moduleDisplayLabel, moduleLabelFor } from './custom-modules.js';
import { loadCaseStudy } from './case-study-store.js';
import { parseJsonSafe } from './utils.js';
import {
  ensurePdfSpace,
  PDF_FONT_FAMILY,
  PDF_MARGIN as MARGIN,
  PDF_MAX_W as MAX_W,
  pdfSafeText,
  pdfText,
} from './pdf-utils.js';

const AXIS_TONES = {
  problem: [198, 40, 40], resource: [46, 125, 50], defense: [183, 148, 26], risk: [211, 164, 24], other: [116, 134, 161],
};
const CARD_BORDER = [211, 222, 238];
const CHIP_FILL = [241, 244, 249];
const TEXT = [24, 47, 83];
const MUTED = [116, 134, 161];
const LEFT_COLUMN_W = 61;
const COLUMN_GAP = 6;

function moduleLabelForElement(value, element, sessions) {
  if (value !== 'medicion_cuantitativa' && value !== 'medicion_cualitativa') {
    return moduleLabelFor(value) || value;
  }
  const module = (sessions || [])
    .flatMap((session) => session.modules || [])
    .find((item) => {
      if (item.module_type !== value) return false;
      const data = parseJsonSafe(item.data, {});
      return (data.elementIds || []).map(String).includes(String(element.id));
    });
  return moduleDisplayLabel(value, module ? parseJsonSafe(module.data, {}) : {});
}

function axisCategories(element, sessions) {
  if (element.kind === SUPPORT_NETWORK_KIND) {
    const people = (element.people || []).filter((person) => person.name)
      .map((person) => [person.name, person.relation && person.relation !== 'Otro' ? person.relation : ''].filter(Boolean).join(' · '));
    return people.length ? [{ label: 'Red de apoyo', values: people }] : [];
  }
  return analysisCategoriesForElement(element, sessions).map((category) => ({
    ...category,
    values: category.values.map((value) => category.kind === 'text' ? value : moduleLabelForElement(value, element, sessions)),
  }));
}

function chipRows(doc, values, maxWidth) {
  const fontSize = 7.8;
  const horizontalPadding = 2.8;
  const verticalPadding = 1.65;
  const gap = 2;
  const lineHeight = fontSize * 0.42;
  const rows = [];
  let row = [];
  let used = 0;
  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.setFontSize(fontSize);
  for (const rawValue of values) {
    const lines = doc.splitTextToSize(pdfSafeText(rawValue), Math.max(18, maxWidth - horizontalPadding * 2));
    const contentWidth = Math.max(...lines.map((line) => doc.getTextWidth(line)), 0);
    const width = Math.min(maxWidth, contentWidth + horizontalPadding * 2);
    const height = lines.length * lineHeight + verticalPadding * 2;
    if (row.length && used + gap + width > maxWidth) {
      rows.push(row); row = []; used = 0;
    }
    row.push({ lines, width, height });
    used += (row.length > 1 ? gap : 0) + width;
  }
  if (row.length) rows.push(row);
  return rows;
}

function rowModel(doc, element, sessions) {
  const rightWidth = MAX_W - LEFT_COLUMN_W - COLUMN_GAP;
  const categories = axisCategories(element, sessions).map((category) => ({ ...category, rows: chipRows(doc, category.values, rightWidth) }));
  let rightHeight = categories.length ? 3 : 0;
  for (const category of categories) {
    rightHeight += 3.7;
    for (const chips of category.rows) rightHeight += Math.max(...chips.map((chip) => chip.height)) + 1.6;
    rightHeight += 1.2;
  }
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(9.5);
  const leftLines = doc.splitTextToSize(pdfSafeText(element.title || 'Elemento'), LEFT_COLUMN_W - 9);
  const status = statusLabelFor(element.axis, element.status);
  // La columna izquierda solo necesita título + estado. No reservamos una
  // altura artificial cuando el elemento no tiene categorías a la derecha.
  const leftHeight = leftLines.length * 4.4 + 0.6 + 3.8;
  return { element, categories, leftLines, status, leftHeight, height: Math.max(leftHeight, rightHeight) + 4 };
}

function drawAxisCard(doc, y, axis, rows, continuation = false) {
  const cardX = MARGIN;
  const cardW = MAX_W;
  const headerH = 16;
  const cardH = headerH + rows.reduce((sum, row) => sum + row.height, 0);
  const rightX = cardX + LEFT_COLUMN_W + COLUMN_GAP;
  const [toneR, toneG, toneB] = AXIS_TONES[axis.id] || AXIS_TONES.other;
  doc.setDrawColor(...CARD_BORDER); doc.setLineWidth(0.35); doc.roundedRect(cardX, y, cardW, cardH, 3, 3, 'S');
  doc.setFillColor(toneR, toneG, toneB); doc.circle(cardX + 4, y + 5.2, 1.65, 'F');
  doc.setTextColor(...TEXT); doc.setFont(PDF_FONT_FAMILY, 'bold'); doc.setFontSize(10.5);
  doc.text(pdfSafeText(`${axis.label}${continuation ? ' (continuación)' : ''}`), cardX + 8, y + 6.8);
  doc.setTextColor(...MUTED); doc.setFontSize(7.2);
  doc.text('ELEMENTO', cardX + 3, y + 12.1); doc.text('ANÁLISIS POR CATEGORÍA', rightX, y + 12.1);
  doc.setDrawColor(...CARD_BORDER); doc.line(cardX, y + headerH, cardX + cardW, y + headerH);

  let cursorY = y + headerH;
  rows.forEach((row, rowIndex) => {
    const contentTop = cursorY + 3.4;
    const leftCenter = contentTop + row.leftHeight / 2 - 2.2;
    doc.setFillColor(toneR, toneG, toneB); doc.circle(cardX + 4, leftCenter, 1.35, 'F');
    doc.setTextColor(...TEXT); doc.setFont(PDF_FONT_FAMILY, 'bold'); doc.setFontSize(9.5);
    row.leftLines.forEach((line, index) => doc.text(line, cardX + 8, contentTop + index * 4.4));
    doc.setFillColor(241, 244, 249); doc.roundedRect(cardX + 8, contentTop + row.leftLines.length * 4.4 + 0.6, 21, 3.8, 1.8, 1.8, 'F');
    doc.setTextColor(...MUTED); doc.setFont(PDF_FONT_FAMILY, 'bold'); doc.setFontSize(6.3);
    doc.text(pdfSafeText(row.status), cardX + 10, contentTop + row.leftLines.length * 4.4 + 3.15);
    let categoryY = contentTop;
    for (const category of row.categories) {
      doc.setTextColor(...MUTED); doc.setFont(PDF_FONT_FAMILY, 'bold'); doc.setFontSize(7.2);
      doc.text(pdfSafeText(category.label).toUpperCase(), rightX, categoryY); categoryY += 3.5;
      for (const chipRow of category.rows) {
        let chipX = rightX;
        const chipH = Math.max(...chipRow.map((chip) => chip.height));
        for (const chip of chipRow) {
          doc.setFillColor(...CHIP_FILL); doc.roundedRect(chipX, categoryY - 2.3, chip.width, chip.height, 1.8, 1.8, 'F');
          doc.setTextColor(...TEXT); doc.setFont(PDF_FONT_FAMILY, 'normal'); doc.setFontSize(7.8);
          const chipLineHeight = 3.28;
          const chipBoxY = categoryY - 2.3;
          const textBlockHeight = chip.lines.length * chipLineHeight;
          const textStartY = chipBoxY + (chip.height - textBlockHeight) / 2 + chipLineHeight * 0.78;
          chip.lines.forEach((line, index) => doc.text(line, chipX + 2.8, textStartY + index * chipLineHeight));
          chipX += chip.width + 2;
        }
        categoryY += chipH + 1.6;
      }
      categoryY += 1.2;
    }
    cursorY += row.height;
    if (rowIndex < rows.length - 1) { doc.setDrawColor(...CARD_BORDER); doc.line(cardX, cursorY, cardX + cardW, cursorY); }
  });
  doc.setTextColor(0, 0, 0);
  return y + cardH;
}

export function renderCaseStudyPdfBlock(doc, y, caseStudy, sessions = []) {
  const elements = caseStudy?.elements || [];
  if (!elements.some((element) => element.title || element.kind === SUPPORT_NETWORK_KIND)) return y;
  y += 8; y = ensurePdfSpace(doc, y, 20);
  y = pdfText(doc, 'Análisis por ejes', MARGIN, y, { size: 12, style: 'bold' }); y += 4;
  for (const axis of CASE_STUDY_AXES) {
    const rows = elements.filter((element) => element.axis === axis.id && (element.title || element.kind === SUPPORT_NETWORK_KIND))
      .map((element) => rowModel(doc, element, sessions));
    if (!rows.length) continue;
    let cursor = 0; let continuation = false;
    while (cursor < rows.length) {
      y = ensurePdfSpace(doc, y, 28);
      const maxContentHeight = 280 - y - 16;
      const pageRows = []; let height = 0;
      while (cursor < rows.length && (!pageRows.length || height + rows[cursor].height <= maxContentHeight)) {
        pageRows.push(rows[cursor]); height += rows[cursor].height; cursor += 1;
      }
      y = drawAxisCard(doc, y, axis, pageRows, continuation); continuation = true; y += 5;
    }
  }
  return y;
}

export async function appendCaseStudyPdf(doc, y, treatmentId, sessions = []) {
  try { return renderCaseStudyPdfBlock(doc, y, await loadCaseStudy(treatmentId), sessions); } catch { return y; }
}
