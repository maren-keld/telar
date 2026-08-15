/** Utilidades compartidas para exportación PDF (jsPDF + Helvetica). */

export const PDF_MARGIN = 18;
export const PDF_PAGE_W = 210;
export const PDF_MAX_W = PDF_PAGE_W - PDF_MARGIN * 2;

export function pdfSafeText(text) {
  return String(text || '')
    .replace(/✓/g, '[x]')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[—–]/g, '-')
    .replace(/→/g, '->')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
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

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '#2f6fed'));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [47, 111, 237];
}

/** Gráfico de línea compacto para una escala. Dibuja marco, ejes y serie. */
export function drawSeriesChart(doc, x, y, w, h, serie) {
  const { points, yMax, color } = serie;
  const rgb = hexToRgb(color);

  doc.setDrawColor(220, 222, 228);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);

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

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130, 134, 142);
  doc.text(String(points[0].label), x, y + h + 3);
  if (points.length > 1) {
    doc.text(String(points[points.length - 1].label), x + w - 6, y + h + 3);
  }
  doc.setTextColor(0, 0, 0);
}
