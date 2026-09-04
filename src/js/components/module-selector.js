import { getModuleDefs } from '../config.js';
import { listCustomModules, resolveModuleDef } from '../custom-modules.js';
import { openCreateModuleModal } from './create-module-modal.js';
import { requireProOrSubscribe } from './subscribe-pro-modal.js';
import { isLicensePendingModule } from '../license-pending-modules.js';
import { psychometricsFor } from '../module-psychometrics.js';
import { moduleSearchBlob, tccHandoutDef, tccVariablesFor } from '../tcc-handout-defs.js';
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
import { CATEGORIES, CUSTOM_CATEGORY_BLURB, CUSTOM_CATEGORY_LABEL } from '../module-categories.js';

export { CATEGORIES };

function searchTextForType(type, def, psych, customTitle) {
  if (customTitle) {
    return `${customTitle} custom mis módulos`.toLowerCase();
  }
  return moduleSearchBlob(type, def, psych);
}

function variablesRow(type) {
  const handout = tccHandoutDef(type);
  const vars = handout?.variables || tccVariablesFor(type);
  if (!vars?.length) return '';
  return `
    <div class="mod-info-row">
      <span><strong>Variables:</strong> ${vars.map(escapeHtml).join(' · ')}</span>
    </div>`;
}

export function previewHtml(type, def, psych, { actionLabel = 'Seleccionar', showAction = true } = {}) {
  const hasPsych = Boolean(psych);
  const rows = hasPsych
    ? `
      <div class="mod-info-row">
        <span><strong>Autor/es:</strong> ${escapeHtml(psych.authors)}</span>
      </div>
      <div class="mod-info-row">
        <span><strong>Rango etario:</strong> ${escapeHtml(psych.ageRange)}</span>
      </div>
      <div class="mod-info-row">
        <span><strong>Confiabilidad:</strong> ${escapeHtml(psych.reliability)}</span>
      </div>
      <div class="mod-info-row">
        <span><strong>Validez (Chile):</strong> ${escapeHtml(psych.validity)}</span>
      </div>
      ${
        psych.license
          ? `<div class="mod-info-row">
        <span><strong>Licencia:</strong> ${escapeHtml(psych.license)}</span>
      </div>`
          : ''
      }`
    : `
      <div class="mod-info-row">
        <span>${escapeHtml(def.description || 'Módulo clínico.')}</span>
      </div>
      ${variablesRow(type)}`;

  return `
    <div class="mod-info">
      <h3 class="mod-info__title">${escapeHtml(def.label)}</h3>
      ${rows}
      ${psych?.learnMore ? `<p class="mod-info__note">${escapeHtml(psych.learnMore)}</p>` : ''}
      ${
        showAction
          ? `<div class="mod-info__actions">
        <span class="mod-info__learn">Más información en Ajustes / manual</span>
        <button type="button" class="btn btn-primary" id="mod-select-btn">${escapeHtml(actionLabel)}</button>
      </div>`
          : `<div class="mod-info__actions">
        <span class="mod-info__learn">Más información en Ajustes / manual</span>
      </div>`
      }
    </div>`;
}

export function applyModuleSearch(listEl, query) {
  const q = query.trim().toLowerCase();
  listEl.querySelectorAll('.mod-selector-item').forEach((btn) => {
    const hay = !q || (btn.dataset.search || '').includes(q);
    btn.hidden = !hay;
  });
  listEl.querySelectorAll('.mod-selector-cat').forEach((cat) => {
    const visible = cat.querySelectorAll('.mod-selector-item:not([hidden])').length > 0;
    cat.hidden = !visible;
  });
}

/** Selector embebido en el centro del workspace (no modal). */
export async function mountModuleSelector(host, ctx) {
  const card = host.closest('.center-module-card');
  card?.classList.add('center-module-card--selector');
  card?.querySelector('.module-card-actions')?.querySelector('#btn-create-module')?.remove();

  host.innerHTML = `
    <div class="card module-selector-inline">
      <div class="module-selector-head">
        <div class="module-selector-head__text">
          <div class="module-selector-title-row">
            <h2 class="module-title">Librería de módulos</h2>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-create-module" data-botonera-extra title="Diseñar un cuestionario propio">Crear módulo</button>
          </div>
        </div>
      </div>
      <div class="mod-selector-search-wrap">
        <input type="search" class="mod-selector-search input" id="mod-selector-search"
          placeholder="Buscar por nombre, categoría, tags (ej. trauma, GAD, ABC)…" autocomplete="off" />
      </div>
      <div class="mod-selector-grid mod-selector-grid--inline">
        <div id="mod-selector-list"></div>
        <div id="mod-selector-preview" class="mod-selector-preview">
          <p class="mod-info__placeholder">Elige un módulo para ver su información.</p>
        </div>
      </div>
    </div>`;

  host.querySelector('#btn-create-module')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: () =>
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
              searchInput: host.querySelector('#mod-selector-search'),
              selectType: moduleType,
            });
          },
        }),
    });
  });

  const searchInput = host.querySelector('#mod-selector-search');
  searchInput?.addEventListener('input', () => {
    applyModuleSearch(host.querySelector('#mod-selector-list'), searchInput.value);
  });

  await loadSelectorList({
    treatmentId: ctx.treatmentId,
    sessionId: ctx.sessionId,
    selectorModuleId: ctx.selectorModuleId,
    onNavigate: ctx.onNavigate,
    refreshWorkspace: ctx.refreshWorkspace,
    listEl: host.querySelector('#mod-selector-list'),
    previewEl: host.querySelector('#mod-selector-preview'),
    searchInput,
  });
}

/** Lista de categorías + ítems, igual en el selector del centro y en el modal de índice. */
export function selectorListInnerHtml({
  filterCategoryId = null,
  inTreatment = new Set(),
  inSession = new Set(),
  onceBlocked = {},
} = {}) {
  const cats = filterCategoryId
    ? CATEGORIES.filter((c) => c.id === filterCategoryId)
    : CATEGORIES;
  const includeCustom = !filterCategoryId || filterCategoryId === 'otros';
  const customMods = includeCustom ? listCustomModules() : [];

  const customItemsHtml = (mods) =>
    mods
      .map((cm) => {
        const type = `custom_${cm.id}`;
        const inUse = inTreatment.has(type) || inSession.has(type);
        const def = resolveModuleDef(type) || { label: cm.title };
        const search = searchTextForType(type, def, null, cm.title);
        return `
          <button type="button" class="mod-selector-item" data-type="${type}" data-search="${escapeHtml(search)}">
            <span>${escapeHtml(cm.title)}</span>
            ${inUse ? '<span class="badge badge--info">En uso</span>' : ''}
          </button>`;
      })
      .join('');

  // Los módulos que llegaron en un pack se agrupan bajo el nombre del pack;
  // los propios quedan en «Mis módulos».
  const ownMods = customMods.filter((cm) => !cm.packId);
  const packGroups = new Map();
  for (const cm of customMods) {
    if (!cm.packId) continue;
    if (!packGroups.has(cm.packId)) packGroups.set(cm.packId, { label: cm.packLabel || cm.packId, mods: [] });
    packGroups.get(cm.packId).mods.push(cm);
  }

  const customCategoryHtml =
    (ownMods.length
      ? `<div class="mod-selector-cat" data-cat="custom">
        <h4>${escapeHtml(CUSTOM_CATEGORY_LABEL)}</h4>
        <p class="mod-selector-cat__blurb">${escapeHtml(CUSTOM_CATEGORY_BLURB)}</p>
        ${customItemsHtml(ownMods)}
      </div>`
      : '') +
    [...packGroups.entries()]
      .map(
        ([packId, group]) => `<div class="mod-selector-cat" data-cat="pack-${escapeHtml(packId)}">
        <h4>${escapeHtml(group.label)}</h4>
        ${customItemsHtml(group.mods)}
      </div>`,
      )
      .join('');

  const catsHtml = cats
    .map((cat) => {
      const available = getModuleDefs();
      const types = cat.types.filter((type) => available[type] && !isLicensePendingModule(type));
      if (!types.length) return '';
      const items = types
        .map((type) => {
          const def = resolveModuleDef(type) || { label: type, description: '' };
          const psych = psychometricsFor(type);
          const blocked = def.oncePerTreatment && onceBlocked[type];
          const inUse = inTreatment.has(type) || inSession.has(type);
          const search = searchTextForType(type, def, psych);
          return `
          <button type="button" class="mod-selector-item" data-type="${type}" data-search="${escapeHtml(search)}" ${blocked ? 'disabled' : ''}>
            <span>${escapeHtml(def.label)}</span>
            ${inUse ? '<span class="badge badge--info">En uso</span>' : ''}
          </button>`;
        })
        .join('');
      const blurb = cat.blurb
        ? `<p class="mod-selector-cat__blurb">${escapeHtml(cat.blurb)}</p>`
        : '';
      return `<div class="mod-selector-cat" data-cat="${cat.id}"><h4>${escapeHtml(cat.label)}</h4>${blurb}${items}</div>`;
    })
    .join('');

  return catsHtml + customCategoryHtml;
}

async function loadSelectorList(ctx) {
  const sessionMods = await getSessionModules(ctx.sessionId);
  const inSession = new Set(
    sessionMods.filter((m) => m.module_type !== 'selector_modulo').map((m) => m.module_type),
  );
  const inTreatment = new Set();
  const oncePerTreatmentBlocked = {};
  for (const [type, def] of Object.entries(getModuleDefs())) {
    if (type === 'selector_modulo') continue;
    const used = await treatmentHasModuleType(ctx.treatmentId, type);
    if (used) inTreatment.add(type);
    if (def.oncePerTreatment && used) {
      oncePerTreatmentBlocked[type] = true;
    }
  }

  const { listEl, previewEl, searchInput } = ctx;
  let selectedType = null;
  let selecting = false;

  listEl.innerHTML = selectorListInnerHtml({
    inTreatment,
    inSession,
    onceBlocked: oncePerTreatmentBlocked,
  });

  if (searchInput?.value) {
    applyModuleSearch(listEl, searchInput.value);
  }

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
    if (selecting) return;
    const def = resolveModuleDef(type);
    if (!def || type === 'selector_modulo') return;

    selecting = true;
    try {
      const selectorRow = await getModule(ctx.selectorModuleId);
      if (!selectorRow || selectorRow.module_type !== 'selector_modulo') {
        if (ctx.refreshWorkspace) {
          await ctx.refreshWorkspace(ctx.selectorModuleId, ctx.sessionId);
        }
        return;
      }

      const sessionModsNow = await getSessionModules(ctx.sessionId);
      const existingInSession = sessionModsNow.find(
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

      const modId = await replaceSelectorWithModule(ctx.selectorModuleId, type, ctx.treatmentId);
      await finishNavigation(ctx.sessionId, modId);
    } catch (e) {
      toast(e.message || 'No se pudo añadir el módulo');
    } finally {
      selecting = false;
    }
  };

  const bindSelectButton = () => {
    previewEl.querySelector('#mod-select-btn')?.addEventListener('click', () => {
      if (selectedType) void selectModule(selectedType);
    });
  };

  listEl.querySelectorAll('.mod-selector-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled || selecting) return;
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
