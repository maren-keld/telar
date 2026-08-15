/**
 * Tipos de ítem de un módulo personalizado.
 *
 * Módulo sin dependencias a propósito: lo consumen tanto el editor como el
 * renderer y el parser de acciones de IA, y cualquier import extra crearía un
 * ciclo entre ellos.
 */
export const CUSTOM_ITEM_TYPES = {
  checkbox: { label: 'Opción múltiple', needsOptions: true },
  text: { label: 'Texto libre', needsOptions: false },
  scale: { label: 'Escala 0–10', needsOptions: false },
  task: { label: 'Ejercicio / tarea', needsOptions: false },
  info: { label: 'Indicación (sin respuesta)', needsOptions: false },
};

export function isValidItemType(type) {
  return Boolean(CUSTOM_ITEM_TYPES[type]);
}

export function itemTypeNeedsOptions(type) {
  return Boolean(CUSTOM_ITEM_TYPES[type]?.needsOptions);
}
