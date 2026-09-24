import { TREATMENT_STATUS, patientGenderLabel } from './config.js';
import { CASE_STUDY_AXES, statusLabelFor, SUPPORT_NETWORK_KIND } from './case-study-model.js';
import { analysisCategoriesForElement } from './case-study-analysis.js';
import { loadCaseStudy } from './case-study-store.js';
import { moduleLabelFor } from './custom-modules.js';
import { getSessionsWithModules, getTreatment } from './db.js';
import { buildReadableText } from './readable-text.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';

const NAVY = '172F55';
const MUTED = '62728D';
const BORDER = 'D5DEEB';
const PALE = 'F2F6FB';
const HEADER = 'E8F0FA';
const AXIS_TONES = { problem: 'C62828', resource: '2E7D32', defense: 'B7941A', risk: 'D3A418', other: '7486A1' };

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function writeUint16(bytes, offset, value) { new DataView(bytes.buffer).setUint16(offset, value, true); }
function writeUint32(bytes, offset, value) { new DataView(bytes.buffer).setUint32(offset, value, true); }
function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}
function zipStore(entries) {
  const encoder = new TextEncoder(); const files = entries.map(([name, content]) => ({ name: encoder.encode(name), data: encoder.encode(content) }));
  const local = []; const central = []; let offset = 0;
  for (const file of files) {
    const crc = crc32(file.data); const header = new Uint8Array(30 + file.name.length);
    writeUint32(header, 0, 0x04034b50); writeUint16(header, 4, 20); writeUint32(header, 14, crc); writeUint32(header, 18, file.data.length); writeUint32(header, 22, file.data.length); writeUint16(header, 26, file.name.length); header.set(file.name, 30); local.push(header, file.data);
    const directory = new Uint8Array(46 + file.name.length);
    writeUint32(directory, 0, 0x02014b50); writeUint16(directory, 4, 20); writeUint16(directory, 6, 20); writeUint32(directory, 16, crc); writeUint32(directory, 20, file.data.length); writeUint32(directory, 24, file.data.length); writeUint16(directory, 28, file.name.length); writeUint32(directory, 42, offset); directory.set(file.name, 46); central.push(directory); offset += header.length + file.data.length;
  }
  const centralBytes = concatBytes(central); const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50); writeUint16(end, 8, files.length); writeUint16(end, 10, files.length); writeUint32(end, 12, centralBytes.length); writeUint32(end, 16, offset);
  return concatBytes([...local, centralBytes, end]);
}

function run(text, { bold = false, size = 22, color = '000000' } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}
function paragraph(content = '', { before = 0, after = 100, keep = false, align = 'left' } = {}) {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>${keep ? '<w:keepNext/>' : ''}</w:pPr>${content}</w:p>`;
}
function textParagraph(text, options = {}) { return paragraph(run(text, options), options); }
function anamnesisParagraph(text) {
  const match = String(text).match(/^([^:]{1,60}):\s*(.*)$/u);
  if (!match) return textParagraph(text, { size: 20, color: '000000', after: 110 });
  return paragraph(`${run(`${match[1]}:`, { bold: true, size: 20, color: '000000' })}${run(` ${match[2]}`, { size: 20, color: '000000' })}`, { after: 110 });
}
function heading(text, level = 1) {
  const size = level === 1 ? 30 : 24;
  return textParagraph(text, { bold: true, size, color: level === 1 ? NAVY : '000000', before: level === 1 ? 320 : 220, after: 130, keep: true });
}
function cell(content, { width, fill = 'FFFFFF', bold = false, color = '000000', size = 20, vertical = 'center' } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:fill="${fill}"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="130" w:type="dxa"/></w:tcMar><w:vAlign w:val="${vertical}"/></w:tcPr>${Array.isArray(content) ? content.join('') : textParagraph(content, { bold, size, color, after: 0 })}</w:tc>`;
}
function table(rows, widths, { header = false } = {}) {
  const borders = `<w:tblBorders><w:top w:val="single" w:sz="8" w:color="${BORDER}"/><w:left w:val="single" w:sz="8" w:color="${BORDER}"/><w:bottom w:val="single" w:sz="8" w:color="${BORDER}"/><w:right w:val="single" w:sz="8" w:color="${BORDER}"/><w:insideH w:val="single" w:sz="6" w:color="${BORDER}"/><w:insideV w:val="single" w:sz="6" w:color="${BORDER}"/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row, index) => `<w:tr>${header && index === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${row.join('')}</w:tr>`).join('')}</w:tbl>`;
}

function buildDocx(body) {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1100" w:right="1100" w:bottom="1100" w:left="1100"/></w:sectPr></w:body></w:document>`;
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', document],
  ]);
}

function patientFromSessions(sessions) {
  const registration = sessions.flatMap((session) => session.modules || []).find((module) => module.module_type === 'registro_inicial');
  return parseJsonSafe(registration?.data, {});
}
function readableModule(module) {
  const data = parseJsonSafe(module.data, {});
  return buildReadableText(module.module_type, data) || data.readable_text || '';
}
function analysisCategories(element, sessions) {
  if (element.kind === SUPPORT_NETWORK_KIND) {
    const people = (element.people || []).filter((person) => person.name).map((person) => [person.name, person.relation && person.relation !== 'Otro' ? person.relation : ''].filter(Boolean).join(' · '));
    return people.length ? [{ label: 'Red de apoyo', values: people }] : [];
  }
  return analysisCategoriesForElement(element, sessions).map((category) => ({ ...category, values: category.values.map((value) => category.kind === 'text' ? value : moduleLabelFor(value) || value) }));
}
function axisTable(axis, elements, sessions) {
  const rows = [[
    cell('ELEMENTO', { width: 2700, fill: HEADER, bold: true, color: MUTED, size: 16 }),
    cell('ANÁLISIS POR CATEGORÍA', { width: 7080, fill: HEADER, bold: true, color: MUTED, size: 16 }),
  ]];
  elements.forEach((element) => {
    const categories = analysisCategories(element, sessions);
    const analysis = categories.length
      ? categories.flatMap((category) => [textParagraph(category.label.toUpperCase(), { bold: true, size: 16, color: MUTED, after: 40, keep: true }), textParagraph(category.values.join(' · '), { size: 19, color: NAVY, after: 100 })])
      : [textParagraph('Sin módulos asociados.', { size: 18, color: MUTED, after: 0 })];
    rows.push([
      cell([textParagraph(`●  ${element.title || 'Elemento'}`, { bold: true, size: 21, color: AXIS_TONES[axis.id] || AXIS_TONES.other, after: 25 }), textParagraph(statusLabelFor(element.axis, element.status), { size: 15, color: MUTED, after: 0 })], { width: 2700, fill: 'FFFFFF' }),
      cell(analysis, { width: 7080, fill: 'FFFFFF' }),
    ]);
  });
  return table(rows, [2700, 7080], { header: true });
}

/** Exporta un DOCX estructurado, editable y legible en Word/Pages. */
export async function exportTreatmentWord(treatmentId) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');
  const sessions = await getSessionsWithModules(treatmentId);
  const patient = patientFromSessions(sessions);
  const status = TREATMENT_STATUS[treatment.status]?.label || treatment.status || '—';
  const patientFields = [['Nombre', patient.nombre || treatment.patient_name], ['Nacimiento', patient.birth_date], ['Género', patientGenderLabel(patient.genero) || patient.genero], ['Email', patient.email], ['Teléfono', patient.telefono || patient.phone], ['Dirección', patient.direccion || patient.address], ['Estado civil', patient.estado_civil || patient.marital_status], ['Previsión', patient.prevision], ['Estado del tratamiento', status]].filter(([, value]) => value);
  const anamnesis = sessions.flatMap((session) => session.modules || []).find((module) => module.module_type === 'motivo_consulta');
  const body = [
    textParagraph('Programa de tratamiento', { bold: true, size: 36, color: '000000', after: 80, keep: true }),
    textParagraph(`Generado el ${formatDate(new Date().toISOString())}`, { size: 18, color: MUTED, after: 230 }),
    heading('Datos del paciente', 2),
    ...patientFields.map(([label, value]) => textParagraph(`${label}: ${value}`, { size: 19, color: '000000', after: 35 })),
  ];
  const anamnesisText = anamnesis ? readableModule(anamnesis) : '';
  if (anamnesisText) body.push(heading('Motivo principal', 2), ...String(anamnesisText).split(/\n+/u).filter(Boolean).map((part) => anamnesisParagraph(part.trim())));
  try {
    const caseStudy = await loadCaseStudy(treatmentId);
    const elements = caseStudy?.elements || [];
    if (elements.some((element) => element.title || element.kind === SUPPORT_NETWORK_KIND)) {
      body.push(heading('Análisis por ejes'));
      CASE_STUDY_AXES.forEach((axis) => {
        const axisElements = elements.filter((element) => element.axis === axis.id && (element.title || element.kind === SUPPORT_NETWORK_KIND));
        if (!axisElements.length) return;
        body.push(heading(axis.label, 2), axisTable(axis, axisElements, sessions), paragraph('', { after: 120 }));
      });
    }
  } catch { /* La exportación del programa continúa aunque no exista estudio de caso. */ }
  const sessionSections = sessions.map((session) => {
    const modules = (session.modules || []).filter((module) => module.module_type !== 'selector_modulo').map((module) => ({ title: moduleLabelFor(module.module_type), body: readableModule(module) })).filter((module) => module.body);
    if (!modules.length) return '';
    return [heading(`Sesión ${session.number}`), ...modules.flatMap((module) => [textParagraph(module.title, { bold: true, size: 22, color: NAVY, before: 90, after: 50, keep: true }), ...String(module.body).split(/\n{2,}/u).filter(Boolean).map((part) => textParagraph(part.trim(), { size: 20, color: '000000', after: 110 }))])].join('');
  }).filter(Boolean);
  if (sessionSections.length) body.push(heading('Sesiones'), ...sessionSections);
  const safeName = String(treatment.patient_name || 'paciente').replace(/[^\w\sáéíóúñ]/giu, '').trim();
  const filename = `programa-tratamiento-${safeName || 'paciente'}.docx`;
  const data = buildDocx(body.join(''));
  if (isTauriApp()) { await getInvoke()('open_pdf_export', { filename, data: Array.from(data), destination: 'desktop' }); return filename; }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); return filename;
}
