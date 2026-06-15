import { getClinicalNotes, getSessionsWithModules, getTreatment } from './db.js';
import { buildReadableText } from './readable-text.js';
import { buildPsychometricSummaryBlock } from './psychometric-summary.js';
import { moduleLabelFor } from './custom-modules.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';

/** Construye el contexto clínico como texto markdown (sin guardar a disco). */
export async function buildCaseContextText(treatmentId) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');

  const sessions = await getSessionsWithModules(treatmentId);
  const notes = await getClinicalNotes(treatmentId);

  const parts = [
    `# Contexto clínico — ${treatment.patient_name}`,
    `Tratamiento n.º ${treatment.number} · Generado ${formatDate(new Date().toISOString())}`,
    '',
    '## Resumen psicométrico (última aplicación por escala)',
    buildPsychometricSummaryBlock(sessions) || '_Sin puntajes psicométricos registrados._',
    '',
    '## Módulos por sesión',
  ];

  for (const session of sessions) {
    parts.push(`\n### Sesión ${session.number}`);
    for (const mod of session.modules) {
      if (mod.module_type === 'selector_modulo') continue;
      const data = parseJsonSafe(mod.data, {});
      const readable = data.readable_text || buildReadableText(mod.module_type, data);
      if (!readable) continue;
      parts.push(`\n#### ${moduleLabelFor(mod.module_type)} (${mod.status || 'pendiente'})`);
      parts.push(readable.replace(/^#\s+.+\n?/gm, '').trim());
    }
  }

  if (notes.length) {
    parts.push('\n## Notas clínicas');
    for (const n of notes) {
      const when = n.created_at ? formatDate(n.created_at) : '';
      parts.push(`\n### Nota ${when}${n.source_label ? ` · ${n.source_label}` : ''}`);
      if (n.quote_text) parts.push(`> ${n.quote_text}`);
      parts.push(n.content || '');
    }
  }

  return parts.join('\n');
}

/**
 * Exporta contexto del caso (readable_text + notas) para conceptualización / IA.
 * Guarda markdown en Documentos/Telar/exportaciones/.
 */
export async function exportCaseContext(treatmentId) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');

  const content = await buildCaseContextText(treatmentId);
  const safe = (treatment.patient_name || 'paciente').replace(/[^\w\s-áéíóúñ]/gi, '').trim() || 'paciente';
  const filename = `contexto-${safe}-t${treatment.number}.md`;

  if (isTauriApp()) {
    await getInvoke()('save_data_export', {
      folderName: 'contexto-caso',
      files: [{ name: filename, content }],
    });
    return filename;
  }

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return filename;
}
