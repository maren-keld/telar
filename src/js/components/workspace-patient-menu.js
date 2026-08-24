import { TREATMENT_STATUS } from '../config.js';
import {
  copyModuleDataBetweenTreatments,
  createTreatment,
  getSessionsWithModules,
  updateTreatmentStatus,
} from '../db.js';
import { requireActivePatientSlot } from '../plan-limits.js';
import { loadProfile, saveProfile } from '../profile.js';
import { escapeHtml, toast } from '../utils.js';
import { setToggle } from '../transitions.js';
import {
  dispatchWorkspaceIndexMode,
  getWorkspaceIndexMode,
} from '../workspace-index-mode.js';

const WORKSPACE_LEFT_WIDTH_KEY = 'telar.workspace.leftSidebarWidth';
const LEFT_FOCUS_CSS_THRESHOLD = 90;

function getCurrentWorkspaceMode() {
  try {
    const w = Number(localStorage.getItem(WORKSPACE_LEFT_WIDTH_KEY) || '260');
    return w <= LEFT_FOCUS_CSS_THRESHOLD ? 'focus' : 'full';
  } catch {
    return 'full';
  }
}

function dispatchWorkspaceMode(mode) {
  document.dispatchEvent(new CustomEvent('telar:workspace-mode', { detail: { mode } }));
}

export async function openWorkspacePatientMenu(anchorEl, treatment, { onNavigate, onUpdated }) {
  const root = document.getElementById('modal-root');
  const rect = anchorEl.getBoundingClientRect();
  const profile = loadProfile();
  const currentMode = getCurrentWorkspaceMode();
  const indexMode = getWorkspaceIndexMode();
  const isDark = profile.darkMode;

  const statusItems = Object.entries(TREATMENT_STATUS)
    .map(([k, v]) => {
      const checked = treatment.status === k;
      return `
        <button type="button" class="patient-menu-status-item${checked ? ' patient-menu-status-item--active' : ''}" data-status="${k}">
          <span class="patient-menu-status-item__check" aria-hidden="true">${checked ? '✓' : ''}</span>
          <span>${escapeHtml(v.label)}</span>
        </button>`;
    })
    .join('');

  root.innerHTML = `
    <div class="dropdown-backdrop" id="workspace-patient-menu-backdrop">
      <div class="dropdown-menu patient-menu t-dropdown" data-origin="top-left" style="top:${rect.bottom + 4}px;left:${Math.max(8, Math.min(rect.left, window.innerWidth - 276))}px;max-height:${Math.max(160, window.innerHeight - rect.bottom - 12)}px">
        <p class="dropdown-menu__title">${escapeHtml(treatment.patient_name)}${treatment.number > 1 ? ` · T${treatment.number}` : ''}</p>

        <label class="dropdown-label">Estado del tratamiento</label>
        <div class="patient-menu-status-list">
          ${statusItems}
        </div>

        <button type="button" class="btn btn-ghost btn-block patient-menu-new-treatment" id="workspace-menu-new-treatment">
          + Añadir tratamiento
        </button>

        <div class="patient-menu-divider"></div>
        <label class="dropdown-label">Espacio de trabajo</label>
        <div class="patient-menu-mode-row">
          <button type="button" class="patient-menu-mode-btn${currentMode === 'focus' ? ' patient-menu-mode-btn--active' : ''}" data-mode="focus">
            Foco
          </button>
          <button type="button" class="patient-menu-mode-btn${currentMode === 'full' ? ' patient-menu-mode-btn--active' : ''}" data-mode="full">
            Completo
          </button>
        </div>

        <div class="patient-menu-divider"></div>
        <label class="dropdown-label">Índice</label>
        <div class="patient-menu-mode-row">
          <button type="button" class="patient-menu-mode-btn${indexMode === 'chrono' ? ' patient-menu-mode-btn--active' : ''}" data-index-mode="chrono">
            Cronológica
          </button>
          <button type="button" class="patient-menu-mode-btn${indexMode === 'category' ? ' patient-menu-mode-btn--active' : ''}" data-index-mode="category">
            Por categoría
          </button>
        </div>

        <div class="patient-menu-divider"></div>
        <div class="patient-menu-toggle-row" id="patient-menu-dark-toggle">
          <span class="patient-menu-toggle-label">Modo oscuro</span>
          <button type="button" class="t-toggle" role="switch" data-on="${isDark ? 'true' : 'false'}" aria-checked="${isDark ? 'true' : 'false'}" aria-label="Modo oscuro">
            <span class="t-toggle-thumb"></span>
          </button>
        </div>
      </div>
    </div>`;

  let currentStatus = treatment.status;

  const close = () => { root.innerHTML = ''; };

  root.querySelector('#workspace-patient-menu-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'workspace-patient-menu-backdrop') close();
  });

  // Status items
  root.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      if (status === currentStatus) return;
      if (status === 'en_tratamiento' && currentStatus !== 'en_tratamiento') {
        const allowed = await requireActivePatientSlot({ patientId: treatment.patient_id });
        if (!allowed) return;
      }
      currentStatus = status;
      root.querySelectorAll('[data-status]').forEach((b) => {
        const active = b.dataset.status === status;
        b.classList.toggle('patient-menu-status-item--active', active);
        b.querySelector('.patient-menu-status-item__check').textContent = active ? '✓' : '';
      });
      await updateTreatmentStatus(treatment.id, status);
      onUpdated?.();
    });
  });

  // Nuevo tratamiento
  root.querySelector('#workspace-menu-new-treatment')?.addEventListener('click', async () => {
    const allowed = await requireActivePatientSlot({ patientId: treatment.patient_id });
    if (!allowed) return;
    try {
      const newId = await createTreatment(treatment.patient_id);
      await copyModuleDataBetweenTreatments(treatment.id, newId, ['registro_inicial', 'motivo_consulta']);
      close();
      toast('Nuevo tratamiento creado');
      const sessions = await getSessionsWithModules(newId);
      const firstMod = sessions[0]?.modules.find((m) => m.module_type === 'selector_modulo') || sessions[0]?.modules[0];
      onNavigate?.({ treatmentId: newId, sessionId: sessions[0]?.id, moduleId: firstMod?.id });
    } catch (err) {
      toast(err.message || 'No se pudo crear el tratamiento');
    }
  });

  // Workspace mode
  root.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      root.querySelectorAll('[data-mode]').forEach((b) => {
        b.classList.toggle('patient-menu-mode-btn--active', b.dataset.mode === mode);
      });
      dispatchWorkspaceMode(mode);
    });
  });

  root.querySelectorAll('[data-index-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.indexMode;
      root.querySelectorAll('[data-index-mode]').forEach((b) => {
        b.classList.toggle('patient-menu-mode-btn--active', b.dataset.indexMode === mode);
      });
      dispatchWorkspaceIndexMode(mode);
      close();
    });
  });

  // Dark mode toggle
  const darkToggle = root.querySelector('#patient-menu-dark-toggle');
  if (darkToggle) {
    let dark = isDark;
    darkToggle.addEventListener('click', () => {
      dark = !dark;
      const sw = darkToggle.querySelector('.t-toggle');
      setToggle(sw, dark);
      saveProfile({ darkMode: dark });
    });
  }
}
