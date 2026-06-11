import { MODULE_DEFS } from '../config.js';
import { listCustomModules, resolveModuleDef } from '../custom-modules.js';
import { openCreateModuleModal } from './create-module-modal.js';
import { psychometricsFor } from '../module-psychometrics.js';
import {
  canDeleteModule,
  deleteSessionModule,
  findModuleInTreatment,
  getModule,
  getSessionModules,
  replaceSelectorWithModule,
  treatmentHasModuleType,
} from '../db.js';
import { escapeHtml, toast } from '../utils.js';

const CATEGORIES = [
  {
    id: 'conceptualizacion',
    label: 'Conceptualización del caso',
    types: ['registro_inicial', 'motivo_consulta', 'redes_apoyo', 'diagnostico'],
  },
  {
    id: 'intervencion',
    label: 'Intervención',
    types: ['neurofeedback'],
  },
  {
    id: 'pruebas',
    label: 'Pruebas psicométricas',
    types: ['dass21', 'eed', 'qols', 'rosenberg', 'escala_animo', 'escala_ansiedad', 'escala_fer'],
  },
];

function previewHtml(type, def, psych) {
  const hasPsych = Boolean(psych);
  const rows = hasPsych
    ? `
      <div class="mod-info-row">
        <span class="mod-info-icon" aria-hidden="true">📖</span>
        <span><strong>Autor/es:</strong> ${escapeHtml(psych.authors)}</span>
      </div>
      <div class="mod-info-row">
        <span class="mod-info-icon" aria-hidden="true">👥</span>
        <span><strong>Rango etario:</strong> ${escapeHtml(psych.ageRange)}</span>
      </div>
      <div class="mod-info-row">
        <span class="mod-info-icon" aria-hidden="true">🛡</span>
        <span><strong>Confiabilidad:</strong> ${escapeHtml(psych.reliability)}</span>
      </div>
      <div class="mod-info-row">
        <span class="mod-info-icon" aria-hidden="true">📍</span>
        <span><strong>Validez (Chile):</strong> ${escapeHtml(psych.validity)}</span>
      </div>`
    : `
      <div class="mod-info-row">
        <span class="mod-info-icon" aria-hidden="true">📋</span>
        <span>${escapeHtml(def.description || 'Módulo clínico.')}</span>
      </div>`;

  return `
    <div class="mod-info">
      <h3 class="mod-info__title">${escapeHtml(def.label)}</h3>
      ${rows}
      ${psych?.learnMore ? `<p class="mod-info__note">${escapeHtml(psych.learnMore)}</p>` : ''}
      <div class="mod-info__actions">
        <span class="mod-info__learn">Más información en Ajustes / manual</span>
        <button type="button" class="btn btn-primary" id="mod-select-btn">Seleccionar</button>
      </div>
    </div>`;
}

/** Selector embebido en el centro del workspace (no modal). */
export async function mountModuleSelector(host, ctx) {
  const card = host.closest('.center-module-card');
  const actionsEl = card?.querySelector('.module-card-actions');
  let createBtn = actionsEl?.querySelector('#btn-create-module');
  if (!createBtn && actionsEl) {
    createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-secondary btn-sm';
    createBtn.id = 'btn-create-module';
    createBtn.title = 'Diseñar un cuestionario propio';
    createBtn.textContent = 'Crear módulo';
    actionsEl.insertBefore(createBtn, actionsEl.firstChild);
  }

  host.innerHTML = `
    <div class="card module-selector-inline">
      <div class="module-selector-title-row">
        <h2 class="module-title" style="margin:0">Seleccionar módulo</h2>
      </div>
      <p class="module-card-head__sub module-selector-sub">Elige un módulo para esta sesión. Al seleccionarlo, este espacio mostrará el módulo elegido.</p>
      <div class="mod-selector-grid mod-selector-grid--inline">
        <div id="mod-selector-list"></div>
        <div id="mod-selector-preview" class="mod-selector-preview">
          <p class="mod-info__placeholder">Elige un módulo para ver su información.</p>
        </div>
      </div>
    </div>`;

  (createBtn || host.querySelector('#btn-create-module'))?.addEventListener('click', () => {
    openCreateModuleModal({
      onCreated: async ({ moduleType }) => {
        await loadSelectorList({
          treatmentId: ctx.treatmentId,
          sessionId: ctx.sessionId,
          selectorModuleId: ctx.selectorModuleId,
          onNavigate: ctx.onNavigate,
          refreshWorkspace: ctx.refreshWorkspace,
          listEl: host.querySelector('#mod-selector-list'),
          previewEl: host.querySelector('#mod-selector-preview'),
          selectType: moduleType,
        });
      },
    });
  });

  await loadSelectorList({
    treatmentId: ctx.treatmentId,
    sessionId: ctx.sessionId,
    selectorModuleId: ctx.selectorModuleId,
    onNavigate: ctx.onNavigate,
    refreshWorkspace: ctx.refreshWorkspace,
    listEl: host.querySelector('#mod-selector-list'),
    previewEl: host.querySelector('#mod-selector-preview'),
  });
}

async function loadSelectorList(ctx) {
  const sessionMods = await getSessionModules(ctx.sessionId);
  const inSession = new Set(
    sessionMods.filter((m) => m.module_type !== 'selector_modulo').map((m) => m.module_type),
  );
  const inTreatment = new Set();
  const oncePerTreatmentBlocked = {};
  for (const [type, def] of Object.entries(MODULE_DEFS)) {
    if (type === 'selector_modulo') continue;
    const used = await treatmentHasModuleType(ctx.treatmentId, type);
    if (used) inTreatment.add(type);
    if (def.oncePerTreatment && used) {
      oncePerTreatmentBlocked[type] = true;
    }
  }

  const customMods = listCustomModules();

  const { listEl, previewEl } = ctx;
  let selectedType = null;

  const customCategoryHtml = customMods.length
    ? `<div class="mod-selector-cat">
        <h4>Mis módulos</h4>
        ${customMods
          .map((cm) => {
            const type = `custom_${cm.id}`;
            const inUse = inTreatment.has(type) || inSession.has(type);
            return `
          <button type="button" class="mod-selector-item" data-type="${type}">
            <span>${escapeHtml(cm.title)}</span>
            ${inUse ? '<span class="badge badge--info">En uso</span>' : ''}
          </button>`;
          })
          .join('')}
      </div>`
    : '';

  listEl.innerHTML =
    customCategoryHtml +
    CATEGORIES.map((cat) => {
    const items = cat.types
      .map((type) => {
        const def = resolveModuleDef(type) || { label: type, description: '' };
        const blocked = def.oncePerTreatment && oncePerTreatmentBlocked[type];
        const inUse = inTreatment.has(type) || inSession.has(type);
        return `
          <button type="button" class="mod-selector-item" data-type="${type}" ${blocked ? 'disabled' : ''}>
            <span>${escapeHtml(def.label)}</span>
            ${inUse ? '<span class="badge badge--info">En uso</span>' : ''}
          </button>`;
      })
      .join('');
    return `<div class="mod-selector-cat"><h4>${escapeHtml(cat.label)}</h4>${items}</div>`;
  }).join('');

  const finishNavigation = async (sessionId, moduleId) => {
    if (ctx.refreshWorkspace) {
      await ctx.refreshWorkspace(moduleId, sessionId);
      return;
    }
    ctx.onNavigate({
      view: 'workspace',
      treatmentId: ctx.treatmentId,
      sessionId,
      moduleId,
    });
  };

  const removeSelectorIfAllowed = async () => {
    const mod = await getModule(ctx.selectorModuleId);
    if (!mod) return;
    const mods = await getSessionModules(mod.session_id);
    if (!canDeleteModule(mod, mods)) return;
    await deleteSessionModule(ctx.selectorModuleId);
  };

  const selectModule = async (type) => {
    const def = resolveModuleDef(type);
    if (!def || type === 'selector_modulo') return;

    try {
      const existingInSession = sessionMods.find(
        (m) => m.module_type === type && String(m.id) !== String(ctx.selectorModuleId),
      );
      if (existingInSession) {
        await removeSelectorIfAllowed();
        await finishNavigation(ctx.sessionId, existingInSession.id);
        return;
      }

      if (def.oncePerTreatment && (await treatmentHasModuleType(ctx.treatmentId, type))) {
        const found = await findModuleInTreatment(ctx.treatmentId, type);
        if (found) {
          await removeSelectorIfAllowed();
          await finishNavigation(found.session_id, found.module_id);
          return;
        }
      }

      const modId = await replaceSelectorWithModule(
        ctx.selectorModuleId,
        type,
        ctx.treatmentId,
      );
      await finishNavigation(ctx.sessionId, modId);
    } catch (e) {
      toast(e.message || 'No se pudo añadir el módulo');
    }
  };

  const bindSelectButton = () => {
    previewEl.querySelector('#mod-select-btn')?.addEventListener('click', () => {
      if (selectedType) void selectModule(selectedType);
    });
  };

  listEl.querySelectorAll('.mod-selector-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const type = btn.dataset.type;
      selectedType = type;
      const def = resolveModuleDef(type) || { label: type, description: 'Módulo clínico.' };
      const psych = def.custom ? null : psychometricsFor(type);

      listEl.querySelectorAll('.mod-selector-item').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });

      previewEl.innerHTML = previewHtml(type, def, psych);
      bindSelectButton();
    });
  });

  if (ctx.selectType) {
    const btn = listEl.querySelector(`[data-type="${ctx.selectType}"]`);
    btn?.click();
  }
}
