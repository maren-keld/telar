import { getPsychometric } from './pack-registry.js';
const LEGACY_MODULE_PSYCHOMETRICS = {};
export function psychometricsFor(type) {
  return getPsychometric(type) || LEGACY_MODULE_PSYCHOMETRICS[type] || null;
}
export const MODULE_PSYCHOMETRICS = LEGACY_MODULE_PSYCHOMETRICS;
