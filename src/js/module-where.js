/**
 * Dónde ocurre el trabajo (cajón clínico), no la escuela ni el canal del enlace.
 * Default por tipo; el puntito de hecho cubre la instancia.
 */
import { getCustomModuleByType, isCustomModuleType } from './custom-modules.js';

export const WHERE_IDS = ['en_sesion', 'entre_sesiones', 'ficha'];

export const WHERE_LABELS = {
  en_sesion: 'En sesión',
  entre_sesiones: 'Entre sesiones',
  ficha: 'Ficha',
};

const FICHA = new Set([
  'registro_inicial',
  'motivo_consulta',
  'diagnostico',
  'nota_sesion',
  'redes_apoyo',
]);

const EN_SESION = new Set(['neurofeedback', 'bilateral_stimulation', 'tcc_autoconceptos']);

/**
 * @param {string} moduleType
 * @returns {'en_sesion'|'entre_sesiones'|'ficha'|null}
 */
export function whereFor(moduleType) {
  const type = String(moduleType || '');
  if (!type || type === 'selector_modulo') return null;
  if (FICHA.has(type)) return 'ficha';
  if (EN_SESION.has(type) || type.startsWith('sig_')) return 'en_sesion';
  if (isCustomModuleType(type)) {
    const custom = getCustomModuleByType(type);
    if (custom?.where && WHERE_IDS.includes(custom.where)) return custom.where;
    return 'entre_sesiones';
  }
  return 'entre_sesiones';
}

export function whereLabel(id) {
  return WHERE_LABELS[id] || id;
}

export function whereDrawers() {
  return WHERE_IDS.map((id) => ({ id, label: WHERE_LABELS[id] }));
}
