import { TREATMENT_STATUS, patientGenderLabel } from './config.js';
import { moduleLabelFor } from './custom-modules.js';
import { getSessionsWithModules, getTreatment } from './db.js';
import { buildReadableText } from './readable-text.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(value) {
  return String(value || '')
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, offset, value) {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}

function writeUint32(bytes, offset, value) {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** ZIP sin compresión: suficiente para un .docx pequeño y compatible con Pages/Word. */
function zipStore(entries) {
  const encoder = new TextEncoder();
  const files = entries.map(([name, content]) => ({ name: encoder.encode(name), data: encoder.encode(content) }));
  const local = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const crc = crc32(file.data);
    const header = new Uint8Array(30 + file.name.length);
    writeUint32(header, 0, 0x04034b50);
    writeUint16(header, 4, 20);
    writeUint32(header, 14, crc);
    writeUint32(header, 18, file.data.length);
    writeUint32(header, 22, file.data.length);
    writeUint16(header, 26, file.name.length);
    header.set(file.name, 30);
    local.push(header, file.data);

    const directory = new Uint8Array(46 + file.name.length);
    writeUint32(directory, 0, 0x02014b50);
    writeUint16(directory, 4, 20);
    writeUint16(directory, 6, 20);
    writeUint32(directory, 16, crc);
    writeUint32(directory, 20, file.data.length);
    writeUint32(directory, 24, file.data.length);
    writeUint16(directory, 28, file.name.length);
    writeUint32(directory, 42, offset);
    directory.set(file.name, 46);
    central.push(directory);
    offset += header.length + file.data.length;
  }
  const centralBytes = concatBytes(central);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralBytes.length);
  writeUint32(end, 16, offset);
  return concatBytes([...local, centralBytes, end]);
}

function wordParagraph(text, { bold = false, size = null } = {}) {
  const runs = String(text || '').split(/\n/u).map((line, index) =>
    `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('');
  const properties = bold || size ? `<w:rPr>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr>` : '';
  return `<w:p><w:r>${properties}${runs}</w:r></w:p>`;
}

function buildDocx(lines) {
  const body = lines.map((line, index) => wordParagraph(line, index === 0 ? { bold: true, size: 32 } : {})).join('');
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`],
  ]);
}

function patientFromSessions(sessions) {
  const registration = sessions
    .flatMap((session) => session.modules || [])
    .find((module) => module.module_type === 'registro_inicial');
  return parseJsonSafe(registration?.data, {});
}

function readableModule(module) {
  const data = parseJsonSafe(module.data, {});
  return buildReadableText(module.module_type, data) || data.readable_text || '';
}

/** Documento HTML compatible con Word: editable y sin depender de un servicio externo. */
export async function exportTreatmentWord(treatmentId) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');
  const sessions = await getSessionsWithModules(treatmentId);
  const patient = patientFromSessions(sessions);
  const status = TREATMENT_STATUS[treatment.status]?.label || treatment.status || '—';
  const patientFields = [
    ['Nombre', patient.nombre || treatment.patient_name],
    ['Nacimiento', patient.birth_date],
    ['Género', patientGenderLabel(patient.genero) || patient.genero],
    ['Estado del tratamiento', status],
  ].filter(([, value]) => value);
  const documentLines = ['Programa de tratamiento — Telar', `Generado: ${formatDate(new Date().toISOString())}`];
  patientFields.forEach(([label, value]) => documentLines.push(`${label}: ${value}`));
  sessions.forEach((session) => {
    const modules = (session.modules || [])
      .filter((module) => module.module_type !== 'selector_modulo')
      .map((module) => {
        const body = readableModule(module);
        return body ? { title: moduleLabelFor(module.module_type), body } : null;
      })
      .filter(Boolean);
    if (!modules.length) return;
    documentLines.push('', `Sesión ${session.number}`);
    modules.forEach(({ title, body }) => documentLines.push(title, body));
  });
  const safeName = String(treatment.patient_name || 'paciente').replace(/[^\w\sáéíóúñ]/giu, '').trim();
  const filename = `programa-tratamiento-${safeName || 'paciente'}.docx`;
  const data = buildDocx(documentLines);

  if (isTauriApp()) {
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(data),
      destination: 'desktop',
    });
    return filename;
  }

  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}
