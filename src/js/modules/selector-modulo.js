import { mountModuleSelector } from '../components/module-selector.js';

export async function renderSelectorModulo(host, moduleRow, { treatment, onNavigate, refreshWorkspace }) {
  await mountModuleSelector(host, {
    treatmentId: treatment.id,
    sessionId: moduleRow.session_id,
    selectorModuleId: moduleRow.id,
    onNavigate,
    refreshWorkspace,
  });
}
