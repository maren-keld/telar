/**
 * Qué se puede enviar al paciente por enlace y en qué forma: una escala del
 * núcleo o de un pack, un cuestionario importado, una experiencia interactiva
 * o un handout (TCC, narrativa, tareas).
 */
import { getCustomModuleByType, isCustomModuleType } from './custom-modules.js';
import { ensureInteractiveCloseable } from './interactive-experience.js';
import { toShareDef } from './questionnaire-defs.js';
import { toShareHandout } from './share-handout.js';
import { tccHandoutDef } from './tcc-handout-defs.js';

export function simpleCustomToHandout(mod) {
  if (!mod || mod.kind === 'interactive' || (mod.kind === 'questionnaire' && mod.def)) return null;
  const sections = (mod.questions || [])
    .filter((q) => q?.text && q.type !== 'info')
    .map((q) => {
      const item = {
        key: String(q.id || q.text).slice(0, 48),
        title: String(q.text),
        type: q.type === 'scale' ? 'number' : 'text',
        hint:
          q.type === 'checkbox' || q.type === 'radio'
            ? `Opciones: ${(q.options || []).join(' · ')}`
            : q.type === 'scale'
              ? 'Escala de 0 a 10'
              : q.type === 'task'
                ? 'Marca cómo fue el ejercicio'
                : '',
        rows: q.type === 'text' || q.type === 'task' ? 3 : 2,
        min: 0,
        max: 10,
      };
      return item;
    });
  return toShareHandout({
    title: mod.title || 'Módulo',
    intro: mod.instructions || '',
    sections,
  });
}

/**
 * @param {string} moduleType
 * @returns {{ def: object }|{ interactive: { title, instructions, html } }|{ handout: object }|null}
 */
export function shareableContentFor(moduleType) {
  if (isCustomModuleType(moduleType)) {
    const mod = getCustomModuleByType(moduleType);
    if (mod?.kind === 'questionnaire' && mod.def) return { def: mod.def };
    if (mod?.kind === 'interactive' && mod.html) {
      return {
        interactive: {
          title: mod.title,
          instructions: mod.instructions || '',
          html: ensureInteractiveCloseable(mod.html),
        },
      };
    }
    const handout = simpleCustomToHandout(mod);
    return handout ? { handout } : null;
  }
  const def = toShareDef(moduleType);
  if (def) return { def };
  const handout = toShareHandout(tccHandoutDef(moduleType));
  return handout ? { handout } : null;
}

export function isShareableModuleType(moduleType) {
  return Boolean(shareableContentFor(moduleType));
}
