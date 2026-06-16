/** Utilidades compartidas para exportación PDF (jsPDF + Helvetica). */

export const PDF_MARGIN = 18;
export const PDF_PAGE_W = 210;
export const PDF_MAX_W = PDF_PAGE_W - PDF_MARGIN * 2;

export function pdfSafeText(text) {
  return String(text || '')
    .replace(/✓/g, '[x]')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, ' ');
}

export function dxItemTexts(items) {
  return (items || [])
    .map((x) => {
      const item = typeof x === 'string' ? { text: x, checked: false } : x;
      return String(item?.text ?? '').trim();
    })
    .filter(Boolean);
}

export function pdfText(doc, text, x, y, { maxWidth = PDF_MAX_W, size = 10, style = 'normal' } = {}) {
  doc.setFontSize(size);
  doc.setFont('helvetica', style);
  const lines = doc.splitTextToSize(pdfSafeText(text), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.42);
}

export function ensurePdfSpace(doc, y, needed = 20) {
  if (y + needed > 280) {
    doc.addPage();
    return PDF_MARGIN + 8;
  }
  return y;
}
