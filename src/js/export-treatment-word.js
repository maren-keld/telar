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
  const sessionSections = sessions.map((session) => {
    const modules = (session.modules || [])
      .filter((module) => module.module_type !== 'selector_modulo')
      .map((module) => {
        const body = readableModule(module);
        return body
          ? `<section><h3>${escapeHtml(moduleLabelFor(module.module_type))}</h3>${paragraphs(body)}</section>`
          : '';
      })
      .join('');
    return modules ? `<section><h2>Sesión ${escapeHtml(session.number)}</h2>${modules}</section>` : '';
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Programa de tratamiento</title>
    <style>body{font-family:Arial,sans-serif;color:#172b4d;line-height:1.45;margin:2.2cm}h1{font-size:20pt;margin:0 0 6pt}h2{font-size:14pt;border-bottom:1px solid #cfd8e6;padding-bottom:4pt;margin-top:24pt}h3{font-size:11pt;margin:16pt 0 4pt}p{font-size:10.5pt;margin:0 0 8pt}.meta{color:#52657f;font-size:9.5pt}.patient{background:#f5f8fc;border:1px solid #d6e0ee;padding:10pt 12pt;margin:14pt 0}</style>
    </head><body><h1>Programa de tratamiento — Telar</h1><p class="meta">Generado: ${escapeHtml(formatDate(new Date().toISOString()))}</p>
    <div class="patient">${patientFields.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}</div>${sessionSections}</body></html>`;
  const safeName = String(treatment.patient_name || 'paciente').replace(/[^\w\s-áéíóúñ]/giu, '').trim();
  const filename = `programa-tratamiento-${safeName || 'paciente'}.doc`;

  if (isTauriApp()) {
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new TextEncoder().encode(html)),
      destination: 'desktop',
    });
    return filename;
  }

  const url = URL.createObjectURL(new Blob([html], { type: 'application/msword;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}
