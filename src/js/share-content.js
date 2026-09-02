/**
 * Qué se puede enviar al paciente por enlace y en qué forma: una escala del
 * núcleo o de un pack, un cuestionario importado, o una experiencia interactiva.
 */
import { getCustomModuleByType, isCustomModuleType } from './custom-modules.js';
import { toShareDef } from './questionnaire-defs.js';

/**
 * @param {string} moduleType
 * @returns {{ def: object }|{ interactive: { title, instructions, html } }|null}
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
          html: mod.html,
        },
      };
    }
    return null;
  }
  const def = toShareDef(moduleType);
  return def ? { def } : null;
}

export function isShareableModuleType(moduleType) {
  return Boolean(shareableContentFor(moduleType));
}
