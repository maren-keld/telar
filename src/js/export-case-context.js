import { getClinicalNotes, getSessionsWithModules, getTreatment } from './db.js';
import { loadCaseStudy } from './case-study-store.js';
import { CASE_STUDY_AXES, statusLabelFor, SUPPORT_NETWORK_KIND } from './case-study-model.js';
import { buildReadableText } from './readable-text.js';
import { buildPsychometricSummaryBlock } from './psychometric-summary.js';
import { moduleLabelFor } from './custom-modules.js';
import { questionnaireDefFor } from './questionnaire-defs.js';
import { shareableContentFor } from './share-content.js';
import { shareAnsweredAt, shareInfo, shareUrl } from './share-sync.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate, parseJsonSafe } from './utils.js';
import { computeVitalRisk } from './vital-risk.js';

function homeworkKind(moduleType, shareable) {
  if (shareable?.def || questionnaireDefFor(moduleType)) return 'cuestionario';
  return 'tarea';
}

function sessionHasPendingShare(session) {
  return (session.modules || []).some((mod) => shareInfo(parseJsonSafe(mod.data, {})));
}

/**
 * Enlaces y handouts que el email post-sesión puede citar.
 * Prioriza sesiones con enlace activo; si no hay, la última sesión.
 */
export function formatPatientHomeworkForPrompt(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const pendingIds = new Set(list.filter(sessionHasPendingShare).map((s) => s.id));
  const last = list[list.length - 1];
  const lines = [];

  for (const session of list) {
    const include = pendingIds.size ? pendingIds.has(session.id) : session.id === last?.id;
    if (!include) continue;
    for (const mod of session.modules || []) {
      if (!mod || mod.module_type === 'selector_modulo') continue;
      const data = parseJsonSafe(mod.data, {});
      if (shareAnsweredAt(data)) continue;
      const share = shareInfo(data);
      const shareable = shareableContentFor(mod.module_type);
      if (!share && !shareable) continue;
      const url = share ? shareUrl(share) : '';
      lines.push(
        `- Sesión ${session.number}: ${moduleLabelFor(mod.module_type)} [${mod.module_type}] (${homeworkKind(mod.module_type, shareable)}) — ${url || 'sin enlace aún'}`,
      );
    }
  }

  if (!lines.length) return '';
  return `## Enlaces y tareas para el paciente
Usa estos URLs literales en emails. No inventes ni acortes enlaces telarapp.cl. Si dice «sin enlace aún», nombra el módulo sin URL.

${lines.join('\n')}`;
}

function listTexts(items) {
  return (items || [])
    .map((item) => String(item?.text || item || '').trim())
    .filter(Boolean);
}

function formatElementDetails(el) {
  const chunks = [];
  const manifestations = listTexts(el.manifestations);
  const indicators = listTexts(el.indicators);
  const objectives = listTexts(el.objectives);
  const evidence = listTexts(el.evidence);
  const activities = (el.activities || [])
    .map((row) => moduleLabelFor(row.moduleType) || row.moduleType)
    .filter(Boolean);
  if (manifestations.length) chunks.push(`manifestaciones: ${manifestations.join('; ')}`);
  if (indicators.length) chunks.push(`indicadores: ${indicators.join('; ')}`);
  if (objectives.length) chunks.push(`objetivos: ${objectives.join('; ')}`);
  if (evidence.length) chunks.push(`evidencia: ${evidence.join('; ')}`);
  if (activities.length) chunks.push(`actividades: ${activities.join('; ')}`);
  return chunks.length ? ` [${chunks.join(' · ')}]` : '';
}

/** Snapshot de Estudio de caso para prompts de IA (ejes + detalles). */
export function formatCaseStudyForPrompt(caseStudy, { vital = null } = {}) {
  const blocks = [];
  if (vital && (vital.label || vital.score != null)) {
    const reasons = Array.isArray(vital.reasons) ? vital.reasons.filter(Boolean).join('; ') : '';
    blocks.push(
      `### Riesgo vital (experimental)\n- ${vital.label || 'Bajo'} (score ${Number(vital.score || 0).toFixed(2)})${reasons ? ` — ${reasons}` : ''}`,
    );
  }
  if (!caseStudy?.elements?.length && !blocks.length) return '';
  for (const axis of CASE_STUDY_AXES) {
    const els = (caseStudy?.elements || []).filter(
      (el) => el.axis === axis.id && (el.title || el.kind === SUPPORT_NETWORK_KIND),
    );
    if (!els.length) continue;
    const lines = els.map((el) => {
      const status = statusLabelFor(axis.id, el.status);
      const notes = String(el.notes || '').trim();
      if (el.kind === SUPPORT_NETWORK_KIND) {
        const people = (el.people || [])
          .map((p) => {
            const bits = [p.name, p.relation, p.domain].filter(Boolean);
            return bits.join(' · ');
          })
          .filter(Boolean)
          .join('; ');
        return `- ${el.title || 'Red de apoyo'} (${status})${people ? `: ${people}` : ''}${notes ? ` — ${notes}` : ''}`;
      }
      return `- ${el.title} (${status})${notes ? ` — ${notes}` : ''}${formatElementDetails(el)}`;
    });
    blocks.push(`### ${axis.label}\n${lines.join('\n')}`);
  }
  if (!blocks.length) return '';
  return `## Estudio de caso (ejes)
Incluye riesgo vital experimental, problemas, factores protectores, red de apoyo, defensas psíquicas, riesgos y demás ejes visibles del estudio.

${blocks.join('\n\n')}`;
}

/** Construye el contexto clínico como texto markdown (sin guardar a disco). */
export async function buildCaseContextText(treatmentId) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) throw new Error('Tratamiento no encontrado');

  const sessions = await getSessionsWithModules(treatmentId);
  const notes = await getClinicalNotes(treatmentId);
  const caseStudy = await loadCaseStudy(treatmentId).catch(() => null);
  const vital = computeVitalRisk({
    sessions,
    caseStudy: caseStudy || {},
    marital: '',
  });

  const parts = [
    `# Contexto clínico — ${treatment.patient_name}`,
    `Tratamiento n.º ${treatment.number} · Generado ${formatDate(new Date().toISOString())}`,
    '',
    '## Resumen psicométrico (última aplicación por escala)',
    buildPsychometricSummaryBlock(sessions) || '_Sin puntajes psicométricos registrados._',
    '',
  ];

  const ejes = formatCaseStudyForPrompt(caseStudy, { vital });
  if (ejes) {
    parts.push(ejes, '');
  }

  const homework = formatPatientHomeworkForPrompt(sessions);
  if (homework) {
    parts.push(homework, '');
  }

  parts.push('## Módulos por sesión');

  for (const session of sessions) {
    parts.push(`\n### Sesión ${session.number}`);
    for (const mod of session.modules) {
      if (mod.module_type === 'selector_modulo') continue;
      const data = parseJsonSafe(mod.data, {});
      const readable = buildReadableText(mod.module_type, data) || data.readable_text || '';
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
