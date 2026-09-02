/**
 * Modo de índice del workspace: cronológico (sesiones) vs por categoría (instrumentos).
 */
import { CATEGORIES as MODULE_CATEGORIES } from './components/module-selector.js';
import { getModuleDef, getModuleDefs } from './config.js';
import { listCustomModules } from './custom-modules.js';
import {
  addModuleToSession,
  addSession,
  getSessionModules,
  replaceSelectorWithModule,
} from './db.js';
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

export const WORKSPACE_INDEX_MODE_KEY = 'telar.workspace.indexMode';
export const WORKSPACE_INDEX_TYPE_KEY = 'telar.workspace.indexType';

export function getWorkspaceIndexMode() {
  try {
    return localStorage.getItem(WORKSPACE_INDEX_MODE_KEY) === 'category' ? 'category' : 'chrono';
  } catch {
    return 'chrono';
  }
}

export function setWorkspaceIndexMode(mode) {
  const next = mode === 'category' ? 'category' : 'chrono';
  try {
    localStorage.setItem(WORKSPACE_INDEX_MODE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

export function dispatchWorkspaceIndexMode(mode) {
  const next = setWorkspaceIndexMode(mode);
  document.dispatchEvent(new CustomEvent('telar:workspace-index-mode', { detail: { mode: next } }));
}

export function getWorkspaceIndexType() {
  try {
    return localStorage.getItem(WORKSPACE_INDEX_TYPE_KEY) || '';
  } catch {
    return '';
  }
}

export function setWorkspaceIndexType(type) {
  try {
    if (type) localStorage.setItem(WORKSPACE_INDEX_TYPE_KEY, type);
    else localStorage.removeItem(WORKSPACE_INDEX_TYPE_KEY);
  } catch {
    /* ignore */
  }
  return type || '';
}

/** Ocurrencias por tipo, sin selector_modulo. */
export function buildUsedModuleIndex(sessions) {
  const byType = new Map();
  for (const session of sessions) {
    for (const mod of session.modules || []) {
      if (mod.module_type === 'selector_modulo') continue;
      if (!byType.has(mod.module_type)) byType.set(mod.module_type, []);
      byType.get(mod.module_type).push({ session, module: mod });
    }
  }
  return byType;
}

export function resolveIndexType(sessions, activeModule) {
  const used = buildUsedModuleIndex(sessions);
  const stored = getWorkspaceIndexType();
  if (stored && used.has(stored)) return stored;
  const current = activeModule?.module_type;
  if (current && current !== 'selector_modulo' && used.has(current)) return current;
  return used.keys().next().value || '';
}

export function sessionsWithTypeOnly(sessions, moduleType) {
  if (!moduleType) return [];
  return sessions
    .map((session) => ({
      ...session,
      modules: (session.modules || []).filter((m) => m.module_type === moduleType),
    }))
    .filter((session) => session.modules.length);
}

export function sessionRuleHtml(sessionNumber) {
  const label = `${escapeHtml(t('workspace.session'))} ${Number(sessionNumber) || ''}`;
  return `<div class="session-rule" role="separator"><span class="session-rule__label">${label}</span></div>`;
}

function categoryOrder() {
  return [...MODULE_CATEGORIES, { id: 'otros', label: 'Otros', types: [] }];
}

function assignedCategoryIds() {
  return new Set(MODULE_CATEGORIES.map((c) => c.id));
}

function categoryIdForType(type) {
  for (const cat of MODULE_CATEGORIES) {
    if (cat.types.includes(type)) return cat.id;
  }
  const def = getModuleDef(type);
  if (def?.category && assignedCategoryIds().has(def.category)) return def.category;
  return 'otros';
}

export function listAddableModuleOptions(categoryId = null) {
  const defs = getModuleDefs();
  const seen = new Set();
  const out = [];
  const push = (type, label, catId, categoryLabel) => {
    if (!type || type === 'selector_modulo' || seen.has(type)) return;
    seen.add(type);
    out.push({ type, label, categoryId: catId, categoryLabel });
  };

  for (const cat of MODULE_CATEGORIES) {
    for (const type of cat.types) {
      const def = defs[type];
      if (!def) continue;
      push(type, def.label, cat.id, cat.label);
    }
  }
  for (const [type, def] of Object.entries(defs)) {
    if (type === 'selector_modulo') continue;
    const catId = categoryIdForType(type);
    const cat = categoryOrder().find((c) => c.id === catId);
    push(type, def.label, catId, cat?.label || 'Otros');
  }
  for (const cm of listCustomModules()) {
    push(`custom_${cm.id}`, cm.title, 'otros', cm.packLabel || 'Otros');
  }

  if (categoryId) return out.filter((o) => o.categoryId === categoryId);
  return out;
}

export function sidebarCategoryHtml(sessions, activeModule, moduleLabelFn, { treatmentId } = {}) {
  const used = buildUsedModuleIndex(sessions);
  const usedTypes = [...used.keys()];
  const activeType = resolveIndexType(sessions, activeModule);
  const blocks = [];

  for (const cat of categoryOrder()) {
    const types = usedTypes.filter((type) => categoryIdForType(type) === cat.id);
    if (cat.id === 'otros' && !types.length && !listCustomModules().length) continue;
    const startCollapsed = isCategoryCollapsed(treatmentId, cat.id, {
      empty: !types.length,
      hasActive: types.includes(activeType),
    });
    const links = types
      .map((type) => {
        const occ = used.get(type) || [];
        const first = occ[0];
        if (!first) return '';
        const active = activeType === type;
        const count = occ.length;
        const label = moduleLabelFn(type);
        return `<a href="#" class="module-link module-link--index${active ? ' active' : ''}" data-index-type="${escapeHtml(type)}" data-session-id="${first.session.id}" data-module-id="${first.module.id}" title="${escapeHtml(label)}"><span class="module-link__label">${escapeHtml(label)}</span>${count > 1 ? `<span class="module-index-count">${count}</span>` : ''}</a>`;
      })
      .join('');
    blocks.push(`
      <section class="index-cat${startCollapsed ? ' index-cat--collapsed' : ''}" data-category-id="${escapeHtml(cat.id)}">
        <button type="button" class="index-cat__title" data-index-cat-toggle aria-expanded="${startCollapsed ? 'false' : 'true'}">
          <span class="index-cat__chevron" aria-hidden="true">▾</span>
          ${escapeHtml(cat.label)}
        </button>
        <div class="index-cat__body">
          <nav class="session-block__modules">${links || ''}</nav>
          <button type="button" class="btn btn-ghost btn-block btn-add-module" data-category-id="${escapeHtml(cat.id)}" title="${escapeHtml(t('workspace.addModule'))}">${escapeHtml(t('workspace.addModule'))}</button>
        </div>
      </section>`);
  }

  return blocks.join('');
}

const collapsedCategoriesByTreatment = new Map();

export function snapshotCategoryCollapse(container, treatmentId) {
  if (!container.querySelector('.index-cat')) return;
  const ids = new Set(
    [...container.querySelectorAll('.index-cat--collapsed')].map((el) => String(el.dataset.categoryId)),
  );
  collapsedCategoriesByTreatment.set(String(treatmentId), ids);
}

export function rememberCategoryCollapsed(treatmentId, categoryId, collapsed) {
  if (treatmentId == null || !categoryId) return;
  const key = String(treatmentId);
  const ids = collapsedCategoriesByTreatment.get(key) || new Set();
  if (collapsed) ids.add(String(categoryId));
  else ids.delete(String(categoryId));
  collapsedCategoriesByTreatment.set(key, ids);
}

function isCategoryCollapsed(treatmentId, categoryId, { empty = false, hasActive = false } = {}) {
  if (hasActive) return false;
  const saved = collapsedCategoriesByTreatment.get(String(treatmentId));
  if (saved) return saved.has(String(categoryId));
  return empty;
}

export function bindCategoryCollapse(container, activeModule, treatmentId) {
  if (container.dataset.indexCatCollapseBound !== '1') {
    container.dataset.indexCatCollapseBound = '1';
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index-cat-toggle]');
      if (!btn || !container.contains(btn)) return;
      const block = btn.closest('.index-cat');
      if (!block) return;
      const collapsed = block.classList.toggle('index-cat--collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      rememberCategoryCollapsed(
        container.dataset.workspaceTreatmentId,
        block.dataset.categoryId,
        collapsed,
      );
    });
  }

  if (activeModule?.module_type) {
    const link = container.querySelector(`.module-link[data-index-type="${activeModule.module_type}"]`);
    const block = link?.closest('.index-cat');
    if (block?.classList.contains('index-cat--collapsed')) {
      block.classList.remove('index-cat--collapsed');
      block.querySelector('[data-index-cat-toggle]')?.setAttribute('aria-expanded', 'true');
      rememberCategoryCollapsed(treatmentId, block.dataset.categoryId, false);
    }
  }
}

export function canAddAnotherOfType(moduleType) {
  const def = getModuleDef(moduleType);
  if (!moduleType || moduleType === 'selector_modulo') return false;
  if (def?.oncePerTreatment) return false;
  return true;
}

function sessionHasType(session, moduleType) {
  return (session.modules || []).some((m) => m.module_type === moduleType);
}

function sessionCanTakeType(session, moduleType, allowMultiple) {
  return Boolean(session) && (allowMultiple || !sessionHasType(session, moduleType));
}

/**
 * Inserta el tipo en una sesión concreta, o crea sesión si sessionId es `new`.
 * Si esa sesión tiene selector vacío, lo reemplaza.
 */
export async function insertModuleAtSession({ treatmentId, moduleType, sessionId }) {
  if (!moduleType || moduleType === 'selector_modulo') {
    throw new Error('Elige un módulo.');
  }
  let sid = sessionId;
  if (sid === 'new' || sid == null || sid === '') {
    sid = await addSession(treatmentId, { addSelector: false });
  }
  const mods = await getSessionModules(sid);
  const sel = mods.find((m) => m.module_type === 'selector_modulo');
  if (sel) {
    const moduleId = await replaceSelectorWithModule(sel.id, moduleType, treatmentId);
    return { sessionId: sid, moduleId };
  }
  const moduleId = await addModuleToSession(sid, moduleType, treatmentId);
  return { sessionId: sid, moduleId };
}

/**
 * Inserta otra instancia del tipo en una sesión que lo acepte.
 * Si la sesión actual ya lo tiene, usa otra; si no hay, crea sesión.
 */
export async function addAnotherOfType({
  treatmentId,
  moduleType,
  sessions = [],
  preferredSessionId = null,
}) {
  if (!canAddAnotherOfType(moduleType)) {
    throw new Error('Este módulo no se puede duplicar en el tratamiento.');
  }
  const def = getModuleDef(moduleType);
  const allowMultiple = Boolean(def?.allowMultipleInSession);

  const pick = (session) => sessionCanTakeType(session, moduleType, allowMultiple);

  let target =
    sessions.find((s) => String(s.id) === String(preferredSessionId) && pick(s)) ||
    [...sessions].reverse().find(pick);

  if (target) {
    return insertModuleAtSession({
      treatmentId,
      moduleType,
      sessionId: target.id,
    });
  }

  return insertModuleAtSession({
    treatmentId,
    moduleType,
    sessionId: 'new',
  });
}
