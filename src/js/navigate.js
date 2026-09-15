import { resolveWorkspaceEntry } from './db.js';

// Las tarjetas resuelven el módulo inicial de forma asíncrona. Si hay clics
// consecutivos, una resolución antigua no puede abrirse sobre la última.
let workspaceNavigationRequest = 0;

/** Abre la ficha (workspace) del tratamiento — sin pantalla intermedia */
export async function openTreatmentWorkspace(treatmentId, onNavigate, overrides = {}) {
  const request = ++workspaceNavigationRequest;
  const entry = await resolveWorkspaceEntry(treatmentId);
  if (request !== workspaceNavigationRequest) return false;
  onNavigate({
    view: 'workspace',
    treatmentId,
    sessionId: overrides.sessionId ?? entry.sessionId,
    moduleId: overrides.moduleId ?? entry.moduleId,
  });
  return true;
}
