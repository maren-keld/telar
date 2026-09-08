/**
 * Pending vs hecho de una instancia. No usar `session_modules.status`:
 * casi todo escribe `completado` al primer autosave.
 *
 * `data.done_override`: true | false | ausente. El override gana.
 * Sin override: hecho si llegó respuesta por enlace o el contenido está completo.
 */
import { getCustomModuleByType, isCustomModuleType } from './custom-modules.js';
import { questionnaireDefFor } from './questionnaire-defs.js';
import { questionnaireItems } from '../lib/questionnaire-schema.js';
import { toShareHandout } from './share-handout.js';
import { shareAnsweredAt } from './share-notify.js';
import { tccHandoutDef } from './tcc-handout-defs.js';
import { parseJsonSafe } from './utils.js';

function asData(data) {
  return typeof data === 'string' ? parseJsonSafe(data, {}) : data && typeof data === 'object' ? data : {};
}

function filled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function answersComplete(answers, expected) {
  if (!expected) return false;
  const list = Array.isArray(answers) ? answers : [];
  if (list.length < expected) return false;
  return list.slice(0, expected).every(filled);
}

function scaleComplete(moduleType, data) {
  const def = questionnaireDefFor(moduleType);
  if (!def) return null;
  if (def.storage?.kind === 'field' && def.storage.field) {
    return filled(data[def.storage.field]);
  }
  return answersComplete(data.answers, questionnaireItems(def).length);
}

function handoutComplete(moduleType, data) {
  const handout = toShareHandout(tccHandoutDef(moduleType));
  if (!handout) return null;
  const keys = [
    ...(handout.sections || []).map((s) => s.key),
    ...(handout.quiz || []).map((q) => q.key),
  ];
  if (!keys.length) return false;
  return keys.every((key) => filled(data[key]));
}

function customComplete(moduleType, data) {
  const mod = getCustomModuleByType(moduleType);
  if (!mod) return false;
  if (mod.kind === 'interactive') {
    return Boolean(data.completed_at || filled(data.summary) || data.payload != null);
  }
  if (mod.kind === 'questionnaire' && mod.def) {
    return answersComplete(data.answers, questionnaireItems(mod.def).length);
  }
  const questions = Array.isArray(mod.questions)
    ? mod.questions.filter((q) => q.type && q.type !== 'info')
    : [];
  if (!questions.length) return false;
  const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
  return questions.every((q) => {
    const value = answers[q.id];
    if (q.type === 'task') return Boolean(value?.done) || filled(value?.comment);
    if (q.type === 'scale') return value !== '' && value != null;
    if (Array.isArray(value)) return value.length > 0;
    return filled(value);
  });
}

/** El formulario o la sesión (NF/BLS) ya tiene lo que cuenta como lleno. */
export function isContentComplete(moduleType, data) {
  const type = String(moduleType || '');
  if (!type || type === 'selector_modulo') return false;
  const d = asData(data);

  if (type === 'neurofeedback') return Boolean(d.last_results);
  if (type === 'bilateral_stimulation') {
    return Boolean(
      String(d.notes || '').trim() ||
        Number(d.elapsed_sec) > 0 ||
        d.sud_pre != null ||
        d.sud_post != null,
    );
  }
  if (type === 'nota_sesion') return filled(d.nota);
  if (type === 'registro_inicial') return filled(d.nombre);
  if (type === 'motivo_consulta') return filled(d.motivo);
  if (type === 'diagnostico') {
    return (Array.isArray(d.problems) ? d.problems : []).some((p) => p?.assigned);
  }
  if (type === 'redes_apoyo') {
    return (Array.isArray(d.people) ? d.people : []).some((p) => filled(p?.name));
  }

  const scale = scaleComplete(type, d);
  if (scale !== null) return scale;

  const handout = handoutComplete(type, d);
  if (handout !== null) return handout;

  if (isCustomModuleType(type)) {
    if (d.completed_at || filled(d.summary) || d.payload != null) return true;
    return customComplete(type, d);
  }
  return false;
}

export function isModuleDone(moduleType, data) {
  const type = String(moduleType || '');
  if (!type || type === 'selector_modulo') return false;
  const d = asData(data);
  if (d.done_override === true) return true;
  if (d.done_override === false) return false;
  if (shareAnsweredAt(d)) return true;
  return isContentComplete(type, d);
}

/** Parche para persistir: el override queda en el sentido contrario al estado actual. */
export function toggleDoneOverride(moduleType, data) {
  return { done_override: !isModuleDone(moduleType, data) };
}

export function doneToastMessage(label, done) {
  const name = String(label || 'Módulo').trim() || 'Módulo';
  return done ? `«${name} marcado como completado»` : `«${name} quedó pendiente»`;
}
