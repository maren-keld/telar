/**
 * Escalas de terceros ocultas del catálogo hasta permiso escrito.
 * El renderer y los datos ya guardados siguen funcionando.
 */
export const LICENSE_PENDING_MODULE_TYPES = new Set(['iesr', 'sprint_ecl']);

export function isLicensePendingModule(type) {
  return LICENSE_PENDING_MODULE_TYPES.has(String(type || ''));
}
