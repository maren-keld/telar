import { listPrograms, getProgram as getPackProgram } from './pack-registry.js';
export function listTreatmentTemplates() {
  return listPrograms();
}
export function getTreatmentTemplate(id) {
  return getPackProgram(id) || null;
}
export const TREATMENT_TEMPLATES = {};
