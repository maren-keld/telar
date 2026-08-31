import { customModuleHandoutPayload, moduleLabelFor } from '../custom-modules.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { mountNotesPanel } from '../components/notes-panel.js';
import { bindWorkspaceModuleDnD } from '../components/workspace-dnd.js';
import { mountTextHighlight } from '../components/text-highlight.js';
import { openWorkspacePatientMenu } from '../components/workspace-patient-menu.js';
import { initWorkspaceSidebarResizers } from '../components/workspace-layout.js';
import { isTauriApp, getInvoke } from '../tauri-bridge.js';
import { flushPendingAutoSaves } from '../autobind.js';
import {
  addModuleToSession,
  addSession,
  canDeleteModule,
  deleteSessionModule,
  findModuleInTreatment,
  getSessionModules,
  getSessionsWithModules,
  getTreatment,
  swapModuleToSelector,
} from '../db.js';
import { renderModule, teardownBilateralStimulation } from '../modules/index.js';
import { NF_HELP_MESSAGE, teardownNeurofeedback } from '../modules/neurofeedback.js';
import { exportTreatmentPdf } from '../export-treatment-pdf.js';
import { exportCasePresentationPdf } from '../export-case-presentation-pdf.js';
import { handoutPdfFilename, renderHandoutPdf } from '../export-handout-pdf.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { t } from '../i18n.js';
import { tccHandoutDef } from '../tcc-handout-defs.js';
import { ICON_DOWNLOAD, ICON_MORE_VERT, ICON_SWAP } from '../icons.js';
import { openAddModuleSessionModal } from '../components/add-module-session-modal.js';
import {
  bindCategoryCollapse,
  canAddAnotherOfType,
  dispatchWorkspaceIndexMode,
  getWorkspaceIndexMode,
  resolveIndexType,
  sessionRuleHtml,
  sessionsWithTypeOnly,
  setWorkspaceIndexType,
  sidebarCategoryHtml,
  snapshotCategoryCollapse,
} from '../workspace-index-mode.js';

/** Un solo listener de índice; se reasigna en cada render para no filtrar. */
let workspaceIndexModeListener = null;

/** Sesiones con más módulos que esto inician colapsadas en el sidebar. */
const SESSION_COLLAPSE_MODULE_THRESHOLD = 5;

/** Sesiones que el usuario colapsó, por tratamiento. Sobrevive al re-render. */
const collapsedSessionsByTreatment = new Map();

/** Posición de scroll del centro a restaurar tras re-render (p. ej. borrar módulo). */
let pendingCenterScrollRestore = null;

export function moduleLabel(type) {
  return moduleLabelFor(type);
}

async function printModulePdf(mod, patientName) {
  const data = parseJsonSafe(mod.data, {});
  const custom = customModuleHandoutPayload(mod.module_type, data);
  const def = tccHandoutDef(mod.module_type) || custom?.def;
  if (!def) return;
  const pdfData = custom?.data || data;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderHandoutPdf(doc, { def, data: pdfData, patientName });

  const filename = handoutPdfFilename(def, patientName);

  if (isTauriApp()) {
    const bytes = doc.output('arraybuffer');
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new Uint8Array(bytes)),
      destination: 'desktop',
    });
    toast(`Handout guardado en el Escritorio: ${filename}`);
    return;
  }

  doc.save(filename);
  toast(`Handout descargado: ${filename}`);
}

export async function renderWorkspace(
  container,
  {
    treatmentId,
    sessionId,
    moduleId,
    onNavigate,
    forceFullRender = false,
    expandSessionId = null,
  },
) {
  const treatment = await getTreatment(treatmentId);
  const sessions = await getSessionsWithModules(treatmentId);
  const activeModuleId = moduleId ? String(moduleId) : null;

  let activeModule = null;
  let activeSessionId = sessionId;
  for (const s of sessions) {
    const m = s.modules.find((x) => String(x.id) === activeModuleId);
    if (m) {
      activeModule = m;
      activeSessionId = s.id;
      break;
    }
  }
  const prevTreatmentId = container.dataset.workspaceTreatmentId;
  const sameTreatment = prevTreatmentId === String(treatmentId);

  if (!activeModule && sessions.length) {
    const s = sessions.find((x) => String(x.id) === String(sessionId)) || sessions[0];
    activeSessionId = s.id;
    const mods = s.modules || [];
    if (sessionId) {
      activeModule = mods[mods.length - 1] || null;
    } else {
      activeModule =
        mods.find((m) => m.module_type === 'registro_inicial') ||
        mods.find((m) => m.module_type !== 'selector_modulo') ||
        mods[0] ||
        null;
    }
  }

  const patientLabel = `${escapeHtml(treatment.patient_name)}${treatment.number > 1 ? ` ${treatment.number}` : ''}`;
  const indexMode = getWorkspaceIndexMode();
  const indexType = indexMode === 'category' ? resolveIndexType(sessions, activeModule) : '';
  if (indexType) setWorkspaceIndexType(indexType);
  if (
    sameTreatment &&
    indexMode === 'category' &&
    indexType &&
    activeModule?.module_type !== indexType
  ) {
    const match = sessions
      .flatMap((s) => (s.modules || []).map((m) => ({ session: s, module: m })))
      .find((row) => row.module.module_type === indexType);
    if (match) {
      activeModule = match.module;
      activeSessionId = match.session.id;
    }
  }

  if (
    !forceFullRender &&
    await tryFastModuleNavigation(container, {
      treatmentId,
      sessionId: activeSessionId,
      moduleId: activeModule?.id,
      activeModule,
      indexMode,
      indexType,
    })
  ) {
    return;
  }

  await flushPendingAutoSaves();

  const prevModuleId = container.dataset.workspaceModuleId;
  const prevScrollRoot = container.querySelector('#workspace-center-scroll');
  const prevScrollTop = prevScrollRoot?.scrollTop ?? 0;
  snapshotSessionCollapse(container, treatmentId);
  snapshotCategoryCollapse(container, treatmentId);
  if (expandSessionId != null) {
    rememberSessionCollapsed(treatmentId, expandSessionId, false);
  }

  // Guardar scroll de notas antes del re-render para no perder posición.
  const savedNotesScroll = container.querySelector('#notes-list')?.scrollTop ?? 0;
  const savedNotesTab = container.querySelector('.space-tools')?.dataset?.activeTab ?? 'notas';
  const preserveCenterScroll =
    pendingCenterScrollRestore != null || (sameTreatment && forceFullRender);

  container.innerHTML = `
    <div class="workspace-layout" id="workspace-layout">
      <div class="workspace-resizer workspace-resizer--left" data-resizer="left" aria-hidden="true"></div>
      <aside class="workspace-sidebar" id="leftsidebar">
        <header class="workspace-sidebar__header">
          <button type="button" class="workspace-back" data-back title="${escapeHtml(t('workspace.backAgenda'))}">←</button>
          <h1 class="workspace-patient-name">${patientLabel}</h1>
          <button type="button" class="workspace-patient-menu" id="btn-patient-menu" title="Opciones del paciente" aria-label="Opciones del paciente">${ICON_MORE_VERT}</button>
        </header>
        <div class="workspace-sidebar__scroll">
          ${
            indexMode === 'category'
              ? sidebarCategoryHtml(sessions, activeModule, moduleLabel, { treatmentId })
              : `${sessions.map((s) => sidebarSessionHtml(s, activeModule, { treatmentId, expandSessionId })).join('')}
          <button type="button" class="btn btn-ghost btn-block workspace-add-session" id="btn-add-session" title="${escapeHtml(t('workspace.addSession'))}">${escapeHtml(t('workspace.addSession'))}</button>`
          }
        </div>
        <footer class="workspace-sidebar__footer">
          <div class="workspace-index-switch" role="group" aria-label="Orden del índice">
            <button type="button" class="workspace-sidebar-toggle${indexMode === 'chrono' ? ' is-active' : ''}" data-sidebar-index-mode="chrono"
              title="Índice cronológico" aria-label="Índice cronológico" aria-pressed="${indexMode === 'chrono' ? 'true' : 'false'}">
              <svg class="workspace-sidebar-toggle__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>
              </svg>
            </button>
            <button type="button" class="workspace-sidebar-toggle${indexMode === 'category' ? ' is-active' : ''}" data-sidebar-index-mode="category"
              title="Índice por categoría" aria-label="Índice por categoría" aria-pressed="${indexMode === 'category' ? 'true' : 'false'}">
              <svg class="workspace-sidebar-toggle__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
            </button>
          </div>
          <button type="button" class="workspace-sidebar-toggle" id="btn-sidebar-toggle"
            title="Contraer o expandir sesiones" aria-label="Contraer o expandir sesiones">
            <svg class="workspace-sidebar-toggle__icon workspace-sidebar-toggle__icon--collapse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 9l-3 3 3 3"/>
            </svg>
            <svg class="workspace-sidebar-toggle__icon workspace-sidebar-toggle__icon--expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M12 9l3 3-3 3"/>
            </svg>
          </button>
        </footer>
      </aside>

      <main class="workspace-center" id="espaciocentral">
        <div class="workspace-center__scroll" id="workspace-center-scroll">
          <div class="workspace-center__inner" id="center-modules">
            ${sessions.length ? '' : '<p class="empty-hint">Añade una sesión para comenzar.</p>'}
          </div>
        </div>
      </main>

      <aside class="workspace-tools" id="rightsidebar"></aside>

      <div class="workspace-resizer workspace-resizer--right" data-resizer="right" aria-hidden="true"></div>
    </div>`;

  const layoutEl = container.querySelector('#workspace-layout');
  const leftSidebarEl = container.querySelector('#leftsidebar');
  const rightSidebarEl = container.querySelector('#rightsidebar');
  const centerScrollEl = container.querySelector('#workspace-center-scroll');
  const firstPaint = !sameTreatment;
  if ((preserveCenterScroll || firstPaint) && centerScrollEl) {
    centerScrollEl.style.visibility = 'hidden';
    centerScrollEl.style.scrollBehavior = 'auto';
  }
  if (layoutEl && leftSidebarEl && rightSidebarEl) {
    initWorkspaceSidebarResizers({ layoutEl, leftSidebarEl, rightSidebarEl });
  }

  const centerHost = container.querySelector('#center-modules');
  let unmountHighlight = () => {};
  if (sessions.length) {
    await renderAllCenterModules(centerHost, sessions, treatment, activeModule, {
      treatmentId,
      activeSessionId,
      activeModule,
      indexMode,
      indexType,
      onNavigate,
      refreshWorkspace: async (moduleId, sessionId) => {
        await renderWorkspace(container, {
          treatmentId,
          sessionId: sessionId ?? activeSessionId,
          moduleId,
          onNavigate,
        });
      },
      async onSwap(modId, sessionId) {
        const next = await swapModuleToSelector(modId);
        onNavigate({
          view: 'workspace',
          treatmentId,
          sessionId: next.sessionId || sessionId,
          moduleId: next.moduleId,
        });
      },
      async onAddSession() {
        const id = await addSession(treatmentId);
        const mods = await getSessionModules(id);
        const sel = mods.find((m) => m.module_type === 'selector_modulo');
        onNavigate({ view: 'workspace', treatmentId, sessionId: id, moduleId: sel?.id });
      },
      async onDelete(deletedId) {
        const root = container.querySelector('#workspace-center-scroll');
        pendingCenterScrollRestore = root?.scrollTop ?? 0;
        const wasActive = String(deletedId) === String(activeModule?.id);
        const remaining = sessions
          .flatMap((s) => s.modules)
          .filter((m) => String(m.id) !== String(deletedId));
        const all = sessions.flatMap((s) => s.modules);
        const idx = all.findIndex((m) => String(m.id) === String(deletedId));
        const neighbor = all[idx + 1] || all[idx - 1];
        const next = wasActive ? neighbor || remaining[0] : activeModule;
        const sess = next
          ? sessions.find((s) => s.modules.some((m) => String(m.id) === String(next.id)))
          : null;
        await renderWorkspace(container, {
          treatmentId,
          sessionId: sess?.id ?? activeSessionId,
          moduleId: next?.id,
          onNavigate,
          forceFullRender: true,
        });
      },
    });
  }

  if (
    activeModule &&
    (!moduleId || (indexMode === 'category' && String(activeModule.id) !== String(moduleId)))
  ) {
    onNavigate({
      view: 'workspace',
      treatmentId,
      sessionId: activeSessionId,
      moduleId: activeModule.id,
    });
  }

  if (activeModule) {
    const scrollToRestore = pendingCenterScrollRestore;
    pendingCenterScrollRestore = null;
    const root = container.querySelector('#workspace-center-scroll');
    const moduleIdStr = String(activeModule.id);
    const y =
      scrollToRestore != null
        ? scrollToRestore
        : sameTreatment && (prevModuleId === moduleIdStr || preserveCenterScroll)
          ? prevScrollTop
          : null;

    if (root) {
      const reveal = () => {
        if (!root.isConnected) return;
        root.style.visibility = '';
      };
      if (y != null) {
        root.scrollTop = y;
        requestAnimationFrame(() => {
          if (!root.isConnected) return;
          root.scrollTop = y;
          reveal();
        });
      } else if (firstPaint) {
        root.scrollTop = 0;
        reveal();
      } else {
        syncScrollToModule(container, activeModule.id);
        requestAnimationFrame(() => {
          if (!root.isConnected) return;
          syncScrollToModule(container, activeModule.id);
          reveal();
        });
      }
    }
    setActiveModuleHighlight(container, activeModule.id, activeModule.module_type);
    if (!firstPaint) scrollSidebarToModule(container, activeModule.id);
  } else {
    pendingCenterScrollRestore = null;
    const root = container.querySelector('#workspace-center-scroll');
    if (root) root.style.visibility = '';
  }
  bindModuleScrollSpy(container);

  container.querySelector('[data-back]')?.addEventListener('click', () => {
    teardownNeurofeedback();
    teardownBilateralStimulation();
    onNavigate({ view: 'treatments' });
  });

  container.querySelector('#btn-patient-menu')?.addEventListener('click', (e) => {
    openWorkspacePatientMenu(e.currentTarget, treatment, {
      onNavigate,
      onUpdated: () => toast('Estado del tratamiento actualizado'),
    });
  });

  container.querySelectorAll('[data-sidebar-index-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dispatchWorkspaceIndexMode(btn.dataset.sidebarIndexMode);
    });
  });

  container.querySelectorAll('.module-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const type = link.dataset.indexType;
      if (type) setWorkspaceIndexType(type);
      if (type && activeModule?.module_type === type) {
        return;
      }
      const mid = link.dataset.moduleId;
      onNavigate({
        view: 'workspace',
        treatmentId,
        sessionId: link.dataset.sessionId,
        moduleId: mid,
      });
    });
  });

  container.querySelectorAll('.btn-add-module[data-session-id], .center-add-module').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await openSessionSelector(treatmentId, Number(btn.dataset.sessionId), onNavigate);
    });
  });

  const goToAdded = (added) => {
    if (!added) return;
    if (added.moduleType) setWorkspaceIndexType(added.moduleType);
    onNavigate({
      view: 'workspace',
      treatmentId,
      sessionId: added.sessionId,
      moduleId: added.moduleId,
    });
  };

  container.querySelectorAll('.btn-add-module[data-category-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void openAddModuleSessionModal({
        treatmentId,
        categoryId: btn.dataset.categoryId,
        preferredSessionId: activeSessionId,
        onAdded: goToAdded,
      });
    });
  });

  container.querySelectorAll('.center-add-same-type').forEach((btn) => {
    btn.addEventListener('click', () => {
      void openAddModuleSessionModal({
        treatmentId,
        presetType: btn.dataset.moduleType,
        preferredSessionId: activeSessionId,
        onAdded: goToAdded,
      });
    });
  });

  container.querySelector('#btn-add-session')?.addEventListener('click', async () => {
    const id = await addSession(treatmentId);
    const mods = await getSessionModules(id);
    const sel = mods.find((m) => m.module_type === 'selector_modulo');
    onNavigate({
      view: 'workspace',
      treatmentId,
      sessionId: id,
      moduleId: sel?.id,
    });
  });

  const toolsOpts = {
    treatmentId,
    onNavigate,
    onJumpToModuleType: async (moduleType) => {
      const found = await findModuleInTreatment(treatmentId, moduleType);
      if (!found) {
        toast('Ese módulo no está en este tratamiento');
        return;
      }
      onNavigate({
        view: 'workspace',
        treatmentId,
        sessionId: found.session_id,
        moduleId: found.module_id,
      });
    },
    onExportPdf: async () => {
      await exportTreatmentPdf(treatmentId);
      toast('PDF exportado en Documentos/Telar/exportaciones');
    },
    onExportCasePresentation: async () => {
      const filename = await exportCasePresentationPdf(treatmentId);
      toast(`${filename} — anonimizado, listo para supervisión`);
    },
    onTemplateApplied: async () => {
      await renderWorkspace(container, {
        treatmentId,
        sessionId: activeSessionId,
        moduleId: activeModule?.id,
        onNavigate,
        forceFullRender: true,
      });
    },
  };

  if (indexMode !== 'category') {
    bindWorkspaceModuleDnD(container, {
      treatmentId,
      activeModuleId: activeModule?.id,
      onNavigate,
      onMoved: async ({ sessionId: movedSessionId, moduleId: movedModuleId }) => {
        const root = container.querySelector('#workspace-center-scroll');
        pendingCenterScrollRestore = root?.scrollTop ?? 0;
        await renderWorkspace(container, {
          treatmentId,
          sessionId: movedSessionId,
          moduleId: movedModuleId ?? activeModule?.id,
          onNavigate,
          forceFullRender: true,
          expandSessionId: movedSessionId,
        });
      },
    });
  }

  bindSessionCollapse(container, activeModule, treatmentId);
  bindCategoryCollapse(container, activeModule, treatmentId);

  const notesApi = await mountNotesPanel(container.querySelector('#rightsidebar'), treatmentId, {
    ...toolsOpts,
    initialNotesScroll: savedNotesScroll,
  });

  // Restaurar tab activo después de re-render.
  if (savedNotesTab && savedNotesTab !== 'notas') {
    const tabBtn = container.querySelector(`.space-tab2[data-tab="${savedNotesTab}"]`);
    if (tabBtn) tabBtn.click();
  }

  unmountHighlight = mountTextHighlight(centerHost, {
    treatmentId,
    onNoteCreated: async () => {
      await notesApi.focusNotasTab();
    },
  });

  container.dataset.workspaceTreatmentId = String(treatmentId);
  container.dataset.workspaceModuleId = activeModule ? String(activeModule.id) : '';
  container.dataset.workspaceIndexMode = indexMode;
  container.dataset.workspaceIndexType = indexType || '';

  if (workspaceIndexModeListener) {
    document.removeEventListener('telar:workspace-index-mode', workspaceIndexModeListener);
  }
  workspaceIndexModeListener = () => {
    if (!container.isConnected) return;
    renderWorkspace(container, {
      treatmentId,
      sessionId: activeSessionId,
      moduleId: activeModule?.id,
      onNavigate,
      forceFullRender: true,
    });
  };
  document.addEventListener('telar:workspace-index-mode', workspaceIndexModeListener);
}

async function tryFastModuleNavigation(container, {
  treatmentId,
  sessionId,
  moduleId,
  activeModule,
  indexMode,
  indexType,
}) {
  if (!moduleId || !activeModule) return false;
  if (container.dataset.workspaceTreatmentId !== String(treatmentId)) return false;
  if (!container.querySelector('#workspace-layout')) return false;
  if ((container.dataset.workspaceIndexMode || 'chrono') !== (indexMode || 'chrono')) return false;
  if (indexMode === 'category' && (container.dataset.workspaceIndexType || '') !== (indexType || '')) {
    return false;
  }
  const card = container.querySelector(`#module-${moduleId}`);
  if (!card) return false;

  // Tras reemplazar el selector, el id es el mismo pero el tipo cambió — hay que re-renderizar.
  if (
    card.dataset.moduleType &&
    activeModule.module_type &&
    card.dataset.moduleType !== activeModule.module_type
  ) {
    return false;
  }

  container.dataset.workspaceModuleId = String(moduleId);
  if (sessionId != null) container.dataset.workspaceSessionId = String(sessionId);

  bindSessionCollapse(container, activeModule, treatmentId);
  bindCategoryCollapse(container, activeModule, treatmentId);
  setActiveModuleHighlight(container, moduleId, activeModule.module_type);
  syncScrollToModule(container, moduleId);
  scrollSidebarToModule(container, moduleId);
  return true;
}

function syncScrollToModule(container, moduleId, pad = 20) {
  if (!moduleId) return;
  const root = container.querySelector('#workspace-center-scroll');
  const el = container.querySelector(`#module-${moduleId}`);
  if (!root || !el) return;
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  root.scrollTop = Math.max(0, root.scrollTop + (elRect.top - rootRect.top) - pad);
}

function setActiveModuleHighlight(container, moduleId, moduleType = '') {
  if (!moduleId) return;
  container.querySelectorAll('.module-link').forEach((link) => {
    if (link.dataset.indexType) {
      link.classList.toggle('active', Boolean(moduleType) && link.dataset.indexType === moduleType);
    } else {
      link.classList.toggle('active', link.dataset.moduleId === String(moduleId));
    }
  });
  container.querySelectorAll('.session-block').forEach((block) => {
    const hasActive = Boolean(
      block.querySelector(`.module-link[data-module-id="${moduleId}"].active`),
    );
    block.classList.toggle('session-block--active', hasActive);
  });
  container.querySelectorAll('.center-module-card').forEach((card) => {
    card.classList.toggle('center-module-card--active', card.id === `module-${moduleId}`);
  });
}

function scrollToModule(container, moduleId, { force = false, smooth = false } = {}) {
  if (!moduleId) return;
  const root = container.querySelector('#workspace-center-scroll');
  const el = container.querySelector(`#module-${moduleId}`);
  if (!root || !el) return;

  const run = () => {
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const pad = 20;
    const isAbove = elRect.top < rootRect.top + pad;
    const isBelow = elRect.bottom > rootRect.bottom - pad;

    if (!force && !isAbove && !isBelow) {
      setActiveModuleHighlight(container, moduleId, el.dataset.moduleType);
      return;
    }

    let next = root.scrollTop;
    if (force || isAbove) {
      next = root.scrollTop + (elRect.top - rootRect.top) - pad;
    } else if (isBelow) {
      next = root.scrollTop + (elRect.bottom - rootRect.bottom) + pad;
    }

    root.scrollTo({
      top: Math.max(0, next),
      behavior: force || !smooth ? 'auto' : 'smooth',
    });
    setActiveModuleHighlight(container, moduleId, el.dataset.moduleType);
  };

  if (force) {
    syncScrollToModule(container, moduleId);
    setActiveModuleHighlight(container, moduleId, el.dataset.moduleType);
  } else {
    requestAnimationFrame(run);
  }
}

function scrollSidebarToModule(container, moduleId) {
  const sidebar = container.querySelector('#leftsidebar .workspace-sidebar__scroll');
  const link = container.querySelector(`.module-link[data-module-id="${moduleId}"]`);
  if (!sidebar || !link) return;

  requestAnimationFrame(() => {
    const sideRect = sidebar.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const pad = 12;
    if (linkRect.top < sideRect.top + pad) {
      sidebar.scrollTop += linkRect.top - sideRect.top - pad;
    } else if (linkRect.bottom > sideRect.bottom - pad) {
      sidebar.scrollTop += linkRect.bottom - sideRect.bottom + pad;
    }
  });
}

function bindModuleScrollSpy(container) {
  const root = container.querySelector('#workspace-center-scroll');
  const cards = container.querySelectorAll('.center-module-card');
  if (!root || !cards.length) return;

  let ticking = false;
  const pickVisible = () => {
    const rootRect = root.getBoundingClientRect();
    const mid = rootRect.top + rootRect.height * 0.35;
    let best = null;
    let bestDist = Infinity;
    cards.forEach((card) => {
      const r = card.getBoundingClientRect();
      if (r.bottom < rootRect.top + 8 || r.top > rootRect.bottom - 8) return;
      const dist = Math.abs(r.top - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    });
    if (best?.dataset.moduleId) {
      setActiveModuleHighlight(container, best.dataset.moduleId, best.dataset.moduleType);
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      pickVisible();
      ticking = false;
    });
  };

  root.addEventListener('scroll', onScroll, { passive: true });
  pickVisible();
}

function createBotoneraEl({ isActive }) {
  const actions = document.createElement('div');
  actions.className = 'module-card-actions botonera-modules';
  if (isActive) actions.id = 'botoneraModules';
  return actions;
}

function appendBotoneraCore(actions, { swappable, handout, deletable, isNf, moduleLabelText, onSwap, onPrint, onDelete }) {
  // Derecha → izquierda: cerrar, cambiar, imprimir, ayuda. En DOM: ayuda, imprimir, cambiar, cerrar.
  if (isNf) {
    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'module-help-btn';
    helpBtn.title = 'Ayuda neurofeedback';
    helpBtn.setAttribute('aria-label', 'Ayuda neurofeedback');
    helpBtn.textContent = '?';
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toast(NF_HELP_MESSAGE);
    });
    actions.appendChild(helpBtn);
  }

  if (handout) {
    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'module-print-btn';
    printBtn.title = 'Descargar PDF del módulo';
    printBtn.setAttribute('aria-label', 'Descargar PDF del módulo');
    printBtn.innerHTML = ICON_DOWNLOAD;
    printBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await onPrint();
      } catch (err) {
        toast(err.message || 'No se pudo generar el PDF');
      }
    });
    actions.appendChild(printBtn);
  }

  if (swappable) {
    const swapBtn = document.createElement('button');
    swapBtn.type = 'button';
    swapBtn.className = 'module-print-btn';
    swapBtn.title = 'Cambiar módulo';
    swapBtn.setAttribute('aria-label', 'Cambiar módulo');
    swapBtn.innerHTML = ICON_SWAP;
    swapBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await openConfirmModal({
        title: '¿Cambiar módulo?',
        message: `¿Deseas reemplazar «${moduleLabelText}»? Se perderá la información del módulo actual.`,
        confirmLabel: 'Cambiar módulo',
      });
      if (!ok) return;
      try {
        await onSwap();
      } catch (err) {
        toast(err.message);
      }
    });
    actions.appendChild(swapBtn);
  }

  if (deletable) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'module-delete-btn';
    del.title = 'Eliminar módulo';
    del.setAttribute('aria-label', 'Eliminar módulo');
    del.textContent = '×';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await openConfirmModal({
        title: '¿Eliminar módulo?',
        message: `¿Estás seguro de eliminar «${moduleLabelText}»? La información del módulo no se puede recuperar.`,
        confirmLabel: 'Eliminar módulo',
      });
      if (!ok) return;
      try {
        await onDelete();
      } catch (err) {
        toast(err.message);
      }
    });
    actions.appendChild(del);
  }
}

function collectBotoneraExtras(wrap, actions) {
  const extras = [];
  wrap.querySelectorAll('[data-botonera-extra], .module-card-head__badge').forEach((el) => {
    if (actions.contains(el) || extras.includes(el)) return;
    extras.push(el);
    el.classList.add('botonera-modules__extra');
  });
  if (!extras.length) return;
  const fragment = document.createDocumentFragment();
  extras.forEach((el) => fragment.appendChild(el));
  actions.insertBefore(fragment, actions.firstChild);
}

function attachBotonera(wrap, actions) {
  collectBotoneraExtras(wrap, actions);
  if (!actions.childElementCount) {
    actions.remove();
    return;
  }
  const head =
    wrap.querySelector('.module-card-head') ||
    wrap.querySelector('.support-module__head') ||
    wrap.querySelector('.module-selector-title-row') ||
    wrap.querySelector('.module-anamnesis-head') ||
    wrap.querySelector('.dx-head') ||
    wrap.querySelector('.nf-header');
  if (head) {
    head.appendChild(actions);
    return;
  }
  const title = wrap.querySelector('.module-title');
  if (title?.parentNode) {
    const row = document.createElement('div');
    row.className = 'botonera-modules-row';
    title.parentNode.insertBefore(row, title);
    row.appendChild(title);
    row.appendChild(actions);
    return;
  }
  wrap.insertBefore(actions, wrap.firstChild);
}

async function renderAllCenterModules(host, sessions, treatment, activeModule, ctx) {
  teardownBilateralStimulation();
  host.innerHTML = '';

  const indexMode = ctx.indexMode || 'chrono';
  const indexType = ctx.indexType || '';
  const displaySessions =
    indexMode === 'category' ? sessionsWithTypeOnly(sessions, indexType) : sessions;

  for (let si = 0; si < displaySessions.length; si++) {
    const session = displaySessions[si];
    host.insertAdjacentHTML('beforeend', sessionRuleHtml(session.number));

    for (const mod of session.modules) {
      const deletable = canDeleteModule(mod, session.modules);
      const handout =
        tccHandoutDef(mod.module_type) ||
        customModuleHandoutPayload(mod.module_type, parseJsonSafe(mod.data, {}))?.def;
      const isActive = activeModule && String(mod.id) === String(activeModule.id);
      const wrap = document.createElement('article');
      wrap.className = `center-module-card${isActive ? ' center-module-card--active' : ''}`;
      wrap.id = `module-${mod.id}`;
      wrap.dataset.moduleId = mod.id;
      wrap.dataset.sessionId = session.id;
      wrap.dataset.moduleType = mod.module_type;
      wrap.dataset.sessionNumber = session.number;

      const swappable = !['registro_inicial', 'motivo_consulta', 'selector_modulo'].includes(mod.module_type);
      const isNf = mod.module_type === 'neurofeedback';
      const actions = createBotoneraEl({ isActive });
      appendBotoneraCore(actions, {
        swappable,
        handout,
        deletable,
        isNf,
        moduleLabelText: moduleLabel(mod.module_type),
        onSwap: () => ctx.onSwap(mod.id, session.id),
        onPrint: () => printModulePdf(mod, treatment.patient_name),
        onDelete: async () => {
          await deleteSessionModule(mod.id);
          toast('Módulo eliminado');
          await ctx.onDelete(mod.id);
        },
      });

      const body = document.createElement('div');
      body.className = 'center-module-card__body';
      wrap.appendChild(body);
      host.appendChild(wrap);
      await renderModule(body, mod, {
        treatment,
        sessionNumber: session.number,
        patientName: treatment.patient_name,
        onNavigate: ctx.onNavigate,
        refreshWorkspace: ctx.refreshWorkspace,
      });
      attachBotonera(wrap, actions);
    }

    const lastMod = session.modules[session.modules.length - 1];
    if (
      indexMode !== 'category' &&
      lastMod &&
      lastMod.module_type !== 'selector_modulo'
    ) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-secondary btn-block center-add-module';
      addBtn.dataset.sessionId = session.id;
      addBtn.title = 'Añadir módulo a esta sesión';
      addBtn.textContent = '+ Agregar módulo';
      host.appendChild(addBtn);
    }

    if (indexMode !== 'category' && si === displaySessions.length - 1 && ctx.onAddSession) {
      const addSessionBtn = document.createElement('button');
      addSessionBtn.type = 'button';
      addSessionBtn.className = 'btn btn-ghost btn-block center-add-session';
      addSessionBtn.title = 'Añadir sesión';
      addSessionBtn.textContent = '+ Agregar sesión';
      addSessionBtn.addEventListener('click', () => ctx.onAddSession());
      host.appendChild(addSessionBtn);
    }
  }

  if (indexMode === 'category' && indexType && canAddAnotherOfType(indexType)) {
    const addSame = document.createElement('button');
    addSame.type = 'button';
    addSame.className = 'btn btn-secondary btn-block center-add-same-type';
    addSame.dataset.moduleType = indexType;
    addSame.title = `Agregar otro ${moduleLabel(indexType)}`;
    addSame.textContent = `+ Agregar ${moduleLabel(indexType)}`;
    host.appendChild(addSame);
  }

  if (!host.children.length) {
    host.innerHTML = '<p class="empty-hint">Añade un módulo desde la barra izquierda.</p>';
  }
}

async function openSessionSelector(treatmentId, sessionId, onNavigate) {
  const mods = await getSessionModules(sessionId);
  let sel = mods.find((m) => m.module_type === 'selector_modulo');
  if (!sel) {
    const id = await addModuleToSession(sessionId, 'selector_modulo', treatmentId);
    sel = { id };
  }
  onNavigate({
    view: 'workspace',
    treatmentId,
    sessionId,
    moduleId: sel.id,
  });
}

function sidebarSessionHtml(session, activeModule, { treatmentId, expandSessionId } = {}) {
  const modCount = session.modules.length;
  const activeInSession =
    activeModule && session.modules.some((m) => String(m.id) === String(activeModule.id));
  const forceExpand =
    expandSessionId != null && String(expandSessionId) === String(session.id);
  const startCollapsed =
    !forceExpand &&
    !activeInSession &&
    isSessionCollapsed(treatmentId, session.id, modCount);

  const mods = session.modules
    .map((m) => {
      const active = activeModule && String(m.id) === String(activeModule.id);
      // Con un solo módulo no hay nada que reordenar y moverlo dejaría la
      // sesión vacía.
      const draggable =
        modCount > 1 &&
        m.module_type !== 'registro_inicial' &&
        m.module_type !== 'motivo_consulta' &&
        m.module_type !== 'selector_modulo';
      return `<a href="#" class="module-link${active ? ' active' : ''}" data-session-id="${session.id}" data-module-id="${m.id}" data-module-type="${escapeHtml(m.module_type)}" data-draggable="${draggable ? 'true' : 'false'}" title="${escapeHtml(moduleLabel(m.module_type))}">${escapeHtml(moduleLabel(m.module_type))}</a>`;
    })
    .join('');

  return `
    <section class="session-block${startCollapsed ? ' session-block--collapsed' : ''}${activeInSession ? ' session-block--active' : ''}" data-session-id="${session.id}">
      <button type="button" class="session-block__title" data-session-toggle aria-expanded="${startCollapsed ? 'false' : 'true'}">
        <span class="session-block__chevron" aria-hidden="true">▾</span>
        ${escapeHtml(t('workspace.session'))} ${session.number}
      </button>
      <div class="session-block__body">
        <nav class="session-block__modules">${mods || `<span class="text-muted">${escapeHtml(t('workspace.noModules'))}</span>`}</nav>
        <button type="button" class="btn btn-ghost btn-block btn-add-module" data-session-id="${session.id}" title="${escapeHtml(t('workspace.addModule'))}">${escapeHtml(t('workspace.addModule'))}</button>
      </div>
    </section>`;
}

function snapshotSessionCollapse(container, treatmentId) {
  if (!container.querySelector('.session-block')) return;
  const ids = new Set(
    [...container.querySelectorAll('.session-block--collapsed')].map((el) =>
      String(el.dataset.sessionId),
    ),
  );
  collapsedSessionsByTreatment.set(String(treatmentId), ids);
}

function rememberSessionCollapsed(treatmentId, sessionId, collapsed) {
  if (treatmentId == null || sessionId == null) return;
  const key = String(treatmentId);
  const ids = collapsedSessionsByTreatment.get(key) || new Set();
  if (collapsed) ids.add(String(sessionId));
  else ids.delete(String(sessionId));
  collapsedSessionsByTreatment.set(key, ids);
}

function isSessionCollapsed(treatmentId, sessionId, modCount) {
  const saved = collapsedSessionsByTreatment.get(String(treatmentId));
  if (saved) return saved.has(String(sessionId));
  return modCount > SESSION_COLLAPSE_MODULE_THRESHOLD;
}

function bindSessionCollapse(container, activeModule, treatmentId) {
  if (container.dataset.sessionCollapseBound !== '1') {
    container.dataset.sessionCollapseBound = '1';
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-session-toggle]');
      if (!btn || !container.contains(btn)) return;
      const block = btn.closest('.session-block');
      if (!block) return;
      const collapsed = block.classList.toggle('session-block--collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      rememberSessionCollapsed(
        container.dataset.workspaceTreatmentId,
        block.dataset.sessionId,
        collapsed,
      );
    });
  }

  if (activeModule) {
    const link = container.querySelector(`.module-link[data-module-id="${activeModule.id}"]`);
    const block = link?.closest('.session-block');
    if (block?.classList.contains('session-block--collapsed')) {
      block.classList.remove('session-block--collapsed');
      block.querySelector('[data-session-toggle]')?.setAttribute('aria-expanded', 'true');
      rememberSessionCollapsed(treatmentId, block.dataset.sessionId, false);
    }
  }
}
