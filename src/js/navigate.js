import { resolveWorkspaceEntry } from './db.js';

/** Abre la ficha (workspace) del tratamiento — sin pantalla intermedia */
export async function openTreatmentWorkspace(treatmentId, onNavigate, overrides = {}) {
  const entry = await resolveWorkspaceEntry(treatmentId);
  onNavigate({
    view: 'workspace',
    treatmentId,
    sessionId: overrides.sessionId ?? entry.sessionId,
    moduleId: overrides.moduleId ?? entry.moduleId,
  });
}
