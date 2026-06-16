import { TREATMENT_STATUS } from '../config.js';
import {
  copyModuleDataBetweenTreatments,
  createTreatment,
  getSessionsWithModules,
  updateTreatmentStatus,
} from '../db.js';
import { escapeHtml, toast } from '../utils.js';

export async function openWorkspacePatientMenu(anchorEl, treatment, { onNavigate, onUpdated }) {
  const root = document.getElementById('modal-root');
  const rect = anchorEl.getBoundingClientRect();

  root.innerHTML = `
    <div class="dropdown-backdrop" id="workspace-patient-menu-backdrop">
      <div class="dropdown-menu" style="top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 280)}px">
        <p class="dropdown-menu__title">${escapeHtml(treatment.patient_name)}${treatment.number > 1 ? ` · T${treatment.number}` : ''}</p>
        <label class="dropdown-label">Estado del tratamiento</label>
        <select id="workspace-menu-status">
          ${Object.entries(TREATMENT_STATUS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${treatment.status === k ? 'selected' : ''}>${escapeHtml(v.label)}</option>`,
            )
            .join('')}
        </select>
        <button type="button" class="btn btn-secondary btn-block" id="workspace-menu-new-treatment" style="margin-top:12px">
          Nuevo tratamiento
        </button>
        <button type="button" class="btn btn-primary btn-block" id="workspace-menu-apply" style="margin-top:8px">Aplicar</button>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelector('#workspace-patient-menu-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'workspace-patient-menu-backdrop') close();
  });

  root.querySelector('#workspace-menu-new-treatment')?.addEventListener('click', async () => {
    try {
      const newId = await createTreatment(treatment.patient_id);
      await copyModuleDataBetweenTreatments(treatment.id, newId, [
        'registro_inicial',
        'motivo_consulta',
      ]);
      close();
      toast('Nuevo tratamiento creado con registro y motivo copiados');
      const sessions = await getSessionsWithModules(newId);
      const firstMod = sessions[0]?.modules.find((m) => m.module_type === 'selector_modulo')
        || sessions[0]?.modules[0];
      onNavigate?.({
        treatmentId: newId,
        sessionId: sessions[0]?.id,
        moduleId: firstMod?.id,
      });
    } catch (err) {
      toast(err.message || 'No se pudo crear el tratamiento');
    }
  });

  root.querySelector('#workspace-menu-apply')?.addEventListener('click', async () => {
    const status = root.querySelector('#workspace-menu-status').value;
    await updateTreatmentStatus(treatment.id, status);
    close();
    onUpdated?.();
  });
}
