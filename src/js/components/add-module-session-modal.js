import { getModuleDef } from '../config.js';
import { resolveModuleDef } from '../custom-modules.js';
import { getSessionsWithModules, treatmentHasModuleType } from '../db.js';
import { t } from '../i18n.js';
import { psychometricsFor } from '../module-psychometrics.js';
import { escapeHtml, toast } from '../utils.js';
import {
  insertModuleAtSession,
  listAddableModuleOptions,
} from '../workspace-index-mode.js';
import {
  applyModuleSearch,
  previewHtml,
  selectorListInnerHtml,
} from './module-selector.js';

function sessionHasType(session, moduleType) {
  return (session.modules || []).some((m) => m.module_type === moduleType);
}

function sessionBlockedForType(session, moduleType) {
  const def = getModuleDef(moduleType) || resolveModuleDef(moduleType);
  if (!moduleType) return false;
  if (def?.allowMultipleInSession) return false;
  return sessionHasType(session, moduleType);
}

function sessionNumber(sessions, sessionId) {
  return sessions.find((s) => String(s.id) === String(sessionId))?.number;
}

/**
 * Popup: mismo catálogo que el selector del centro, más la sesión destino.
 * @returns {Promise<{ sessionId: number, moduleId: number } | null>}
 */
export function openAddModuleSessionModal({
  treatmentId,
  categoryId = null,
  presetType = '',
  preferredSessionId = null,
  onAdded = null,
} = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const options = listAddableModuleOptions();
    const allowed = new Set(options.map((o) => o.type));
    const categoryFirst = categoryId ? listAddableModuleOptions(categoryId)[0]?.type : '';
    const initialType =
      (presetType && allowed.has(presetType) ? presetType : null) ||
      (categoryFirst && allowed.has(categoryFirst) ? categoryFirst : null) ||
      options[0]?.type ||
      '';

    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal-card add-mod-modal add-mod-modal--catalog" role="dialog" aria-labelledby="add-mod-title">
          <h2 id="add-mod-title" class="modal-card__title">Añadir módulo</h2>
          <div class="mod-selector-search-wrap">
            <input type="search" class="mod-selector-search input" id="add-mod-search"
              placeholder="Buscar por nombre, categoría, tags…" autocomplete="off" />
          </div>
          <div class="mod-selector-grid mod-selector-grid--inline add-mod-modal__grid">
            <div id="add-mod-list"></div>
            <div id="add-mod-preview" class="mod-selector-preview">
              <p class="mod-info__placeholder">Elige un módulo para ver su información.</p>
            </div>
          </div>
          <div class="add-mod-modal__session">
            <label class="add-mod-modal__label" for="add-mod-session">Sesión</label>
            <select class="input" id="add-mod-session"></select>
            <p class="add-mod-modal__session-hint" id="add-mod-session-hint"></p>
          </div>
          <p class="add-mod-modal__note" id="add-mod-note" hidden></p>
          <div class="modal-card__actions">
            <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-primary" id="add-mod-confirm" ${options.length ? '' : 'disabled'}>Añadir</button>
          </div>
        </div>
      </div>`;

    const listEl = root.querySelector('#add-mod-list');
    const previewEl = root.querySelector('#add-mod-preview');
    const searchInput = root.querySelector('#add-mod-search');
    const sessionEl = root.querySelector('#add-mod-session');
    const hintEl = root.querySelector('#add-mod-session-hint');
    const noteEl = root.querySelector('#add-mod-note');
    const confirmBtn = root.querySelector('#add-mod-confirm');
    let sessions = [];
    let filling = false;
    let selectedType = initialType;

    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };

    const selectedLabel = () =>
      resolveModuleDef(selectedType)?.label || getModuleDef(selectedType)?.label || selectedType;

    const updateHint = () => {
      if (!selectedType) {
        hintEl.textContent = 'Elige un módulo y la sesión donde quedará.';
        return;
      }
      const label = selectedLabel();
      const val = sessionEl.value;
      if (val === 'new') {
        hintEl.textContent = `«${label}» quedará en una sesión nueva.`;
        return;
      }
      const n = sessionNumber(sessions, val);
      hintEl.textContent =
        n != null ? `«${label}» quedará en la sesión ${n}.` : `«${label}» quedará en la sesión elegida.`;
    };

    const fillSessions = async () => {
      const moduleType = selectedType || '';
      const prev = sessionEl.value;
      const def = getModuleDef(moduleType) || resolveModuleDef(moduleType);
      const onceBlocked = def?.oncePerTreatment && (await treatmentHasModuleType(treatmentId, moduleType));
      const rows = sessions.map((s) => {
        const blocked = sessionBlockedForType(s, moduleType);
        const label = `${t('workspace.session')} ${s.number}${blocked ? ' — ya está en esta sesión' : ''}`;
        return { id: s.id, label, blocked };
      });
      const keep =
        (prev && rows.some((r) => String(r.id) === prev && !r.blocked) ? prev : null) ||
        (preferredSessionId &&
        rows.some((r) => String(r.id) === String(preferredSessionId) && !r.blocked)
          ? String(preferredSessionId)
          : null) ||
        [...rows].reverse().find((r) => !r.blocked)?.id ||
        'new';

      sessionEl.innerHTML =
        rows
          .map(
            (r) =>
              `<option value="${r.id}"${r.blocked ? ' disabled' : ''}${String(r.id) === String(keep) ? ' selected' : ''}>${escapeHtml(r.label)}</option>`,
          )
          .join('') + `<option value="new"${keep === 'new' ? ' selected' : ''}>+ Nueva sesión</option>`;

      if (onceBlocked) {
        noteEl.hidden = false;
        noteEl.textContent = `Este tratamiento ya tiene «${def.label}».`;
        confirmBtn.disabled = true;
      } else if (!moduleType || !options.length) {
        noteEl.hidden = true;
        confirmBtn.disabled = true;
      } else {
        noteEl.hidden = true;
        confirmBtn.disabled = false;
      }
      updateHint();
    };

    const showPreview = (type) => {
      selectedType = type;
      const def = resolveModuleDef(type) || { label: type, description: 'Módulo clínico.' };
      const psych = def.custom ? null : psychometricsFor(type);
      previewEl.innerHTML = previewHtml(type, def, psych, { showAction: false });
      listEl.querySelectorAll('.mod-selector-item').forEach((b) => {
        b.classList.toggle('active', b.dataset.type === type);
      });
      void fillSessions();
    };

    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(null));
    root.querySelector('[data-close]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(null);
    });
    searchInput?.addEventListener('input', () => applyModuleSearch(listEl, searchInput.value));
    sessionEl?.addEventListener('change', updateHint);

    confirmBtn?.addEventListener('click', async () => {
      if (filling || confirmBtn.disabled) return;
      const moduleType = selectedType;
      const sessionVal = sessionEl?.value;
      if (!moduleType) return;
      filling = true;
      confirmBtn.disabled = true;
      try {
        const added = await insertModuleAtSession({
          treatmentId,
          moduleType,
          sessionId: sessionVal,
        });
        const result = { ...added, moduleType };
        if (onAdded) await onAdded(result);
        close(result);
      } catch (err) {
        toast(err.message || 'No se pudo añadir el módulo');
        filling = false;
        confirmBtn.disabled = false;
      }
    });

    void (async () => {
      sessions = await getSessionsWithModules(treatmentId);
      const inTreatment = new Set();
      const onceBlocked = {};
      for (const opt of options) {
        const used = await treatmentHasModuleType(treatmentId, opt.type);
        if (used) inTreatment.add(opt.type);
        const def = getModuleDef(opt.type) || resolveModuleDef(opt.type);
        if (def?.oncePerTreatment && used) onceBlocked[opt.type] = true;
      }
      listEl.innerHTML =
        selectorListInnerHtml({
          inTreatment,
          inSession: new Set(),
          onceBlocked,
        }) || `<p class="text-muted">No hay módulos disponibles.</p>`;

      listEl.querySelectorAll('.mod-selector-item').forEach((btn) => {
        if (allowed.size && !allowed.has(btn.dataset.type)) {
          btn.remove();
          return;
        }
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          showPreview(btn.dataset.type);
        });
      });
      listEl.querySelectorAll('.mod-selector-cat').forEach((cat) => {
        if (!cat.querySelector('.mod-selector-item')) cat.remove();
      });
      const catSel =
        categoryId === 'otros'
          ? listEl.querySelector('[data-cat="custom"]')
          : categoryId
            ? listEl.querySelector(`[data-cat="${categoryId}"]`)
            : null;
      catSel?.scrollIntoView({ block: 'nearest' });

      if (initialType) {
        const btn = listEl.querySelector(`[data-type="${initialType}"]`);
        if (btn && !btn.disabled) showPreview(initialType);
        else await fillSessions();
      } else {
        await fillSessions();
      }
    })();
  });
}
