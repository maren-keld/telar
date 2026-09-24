import { recommendedModuleTypesForElements } from './case-study-model.js';

/** Elementos del caso, con los recomendados para este módulo al comienzo. */
export function axisAssignmentRows(elements, moduleType) {
  return (elements || [])
    .filter((element) => element?.id && String(element.title || '').trim())
    .map((element) => ({
      ...element,
      recommended: recommendedModuleTypesForElements([element]).has(moduleType),
    }))
    .sort(
      (a, b) =>
        Number(b.recommended) - Number(a.recommended) ||
        String(a.title).localeCompare(String(b.title), 'es'),
    );
}
