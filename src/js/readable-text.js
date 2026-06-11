import { MODULE_DEFS } from './config.js';
import { saveModuleData } from './db.js';
import { parseJsonSafe } from './utils.js';

function linesFromObject(obj, labels) {
  return labels
    .map(({ key, label }) => {
      const v = obj[key];
      if (v == null || v === '') return null;
      return `${label}: ${v}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function buildReadableText(moduleType, data) {
  const d = data || {};
  switch (moduleType) {
    case 'registro_inicial':
      return linesFromObject(d, [
        { key: 'nombre', label: 'Nombre' },
        { key: 'genero', label: 'Género' },
        { key: 'id_number', label: 'ID' },
        { key: 'birth_date', label: 'Nacimiento' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'address', label: 'Dirección' },
        { key: 'marital_status', label: 'Estado civil' },
        { key: 'source', label: 'Fuente' },
        { key: 'ocupaciones', label: 'Ocupaciones' },
      ]);
    case 'motivo_consulta':
      return [
        d.motivo ? `Motivo: ${d.motivo}` : null,
        d.expectativas ? `Expectativas: ${d.expectativas}` : null,
        d.antecedentes ? `Antecedentes: ${d.antecedentes}` : null,
        d.urgencia ? `Urgencia: ${d.urgencia}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    case 'redes_apoyo': {
      const people = (d.people || []).filter((p) => p.name);
      if (!people.length) return '';
      return people
        .map((p) => {
          const parts = [p.name, p.relation, p.domain].filter(Boolean);
          const note = p.notes ? ` — ${p.notes}` : '';
          return parts.join(' · ') + note;
        })
        .join('\n');
    }
    case 'neurofeedback': {
      const meta = d.last_meta || {};
      const res = d.last_results || {};
      return [
        meta.protocol ? `Protocolo: ${meta.protocol}` : null,
        meta.device ? `Dispositivo: ${meta.device}` : null,
        res.relaxation_pct != null ? `Relajación: ${res.relaxation_pct}%` : null,
        res.calm_pct != null ? `Calma: ${res.calm_pct}%` : null,
        res.attentive_pct != null ? `Atención: ${res.attentive_pct}%` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }
    default:
      return '';
  }
}

/** Texto plano del módulo para contexto de IA (futuro). */
export async function syncModuleReadableText(moduleRow, payload, status) {
  const prev = parseJsonSafe(moduleRow.data, {});
  const merged = { ...prev, ...payload };
  const readable = buildReadableText(moduleRow.module_type, merged);
  const label = MODULE_DEFS[moduleRow.module_type]?.label || moduleRow.module_type;
  const header = `# ${label}\n`;
  merged.readable_text = readable ? `${header}${readable}` : header;
  await saveModuleData(moduleRow.id, merged, status || moduleRow.status || 'pendiente');
  return merged;
}
