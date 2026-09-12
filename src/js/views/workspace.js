import { customModuleHandoutPayload, getCustomModuleByType, moduleLabelFor } from '../custom-modules.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { mountNotesPanel } from '../components/notes-panel.js';
import { captureNotesScroll, restoreNotesScroll } from '../notes-window.js';
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
  getModule,
  getSessionModules,
  getSessionsWithModules,
  getTreatment,
  isSessionDone,
  sessionHasModuleLibrary,
  setSessionDone,
  swapModuleToSelector,
} from '../db.js';
import { doneToastMessage, isModuleDone, toggleDoneOverride } from '../module-done.js';
import { syncModuleReadableText } from '../readable-text.js';
import { renderModule, teardownBilateralStimulation, teardownInteractiveHtml } from '../modules/index.js';
import { NF_HELP_MESSAGE, teardownNeurofeedback } from '../modules/neurofeedback.js';
import { exportTreatmentPdf } from '../export-treatment-pdf.js';
import { exportCasePresentationPdf } from '../export-case-presentation-pdf.js';
import { handoutPdfFilename, renderHandoutPdf } from '../export-handout-pdf.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { t } from '../i18n.js';
import { tccHandoutDef } from '../tcc-handout-defs.js';
import { ICON_DOWNLOAD, ICON_LINK, ICON_MORE_VERT, ICON_SWAP } from '../icons.js';
import { openShareModuleModal } from '../components/share-module-modal.js';
import { shareableContentFor } from '../share-content.js';
import { shareCompletedByLinkLabel } from '../module-editor-model.js';
import { shareAnsweredAt, shareInfo } from '../share-sync.js';
import { formatShareAnsweredAt } from '../share-notify.js';
import { openAddModuleSessionModal } from '../components/add-module-session-modal.js';
import {
  bindCategoryCollapse,
  canAddAnotherOfType,
  dispatchWorkspaceIndexMode,
  getWorkspaceIndexMode,
  getWorkspaceIndexType,
  resolveIndexType,
  sessionRuleHtml,
  sessionsForCenter,
  setWorkspaceIndexType,
  sidebarAddRowHtml,
  sidebarCategoryHtml,
  snapshotCategoryCollapse,
} from '../workspace-index-mode.js';
import {
  centerModuleIdsMatch,
  moduleViewportOffset,
  nextScrollTopForModule,
  scheduleRestoreModuleViewportOffset,
  snapshotModuleCardHeights,
} from '../workspace-center-scroll.js';

/** Un solo listener de índice; se reasigna en cada render para no filtrar. */
let workspaceIndexModeListener = null;

async function flushWorkspaceSaves() {
  try {
    await flushPendingAutoSaves();
    return true;
  } catch {
    return false;
  }
}

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
  const customMod = getCustomModuleByType(mod.module_type);
  if (customMod?.pdfPath && isTauriApp()) {
    await getInvoke()('open_local_pdf', { path: customMod.pdfPath });
    toast(`PDF adjunto: ${customMod.pdfName || 'archivo.pdf'}`);
    return;
  }
  if (customMod?.kind === 'interactive') return;
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
  if (
    !forceFullRender &&
    moduleId &&
    container.dataset.workspaceTreatmentId === String(treatmentId)
  ) {
    const indexMode = getWorkspaceIndexMode();
    const card = container.querySelector(`#module-${moduleId}`);
    const moduleType = card?.dataset.moduleType || '';
    const indexType = indexMode === 'category' ? getWorkspaceIndexType() || moduleType : '';
    if (
      await tryFastModuleNavigation(container, {
        treatmentId,
        sessionId,
        moduleId,
        activeModule: card ? { id: moduleId, module_type: moduleType } : null,
        indexMode,
        indexType,
      })
    ) {
      return;
    }
  }

  const alreadyOpen = Boolean(container.querySelector('#workspace-layout'));
  if (alreadyOpen && !(await flushWorkspaceSaves())) return;

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

  if (!(await flushWorkspaceSaves())) return;

  const prevModuleId = container.dataset.workspaceModuleId;
  const prevScrollRoot = container.querySelector('#workspace-center-scroll');
  const prevScrollTop = prevScrollRoot?.scrollTop ?? 0;
  snapshotSessionCollapse(container, treatmentId);
  snapshotCategoryCollapse(container, treatmentId);
  if (expandSessionId != null) {
    rememberSessionCollapsed(treatmentId, expandSessionId, false);
  }

  // Guardar scroll de notas antes del re-render para no perder posición.
  const savedNotesScroll = captureNotesScroll(container);
  const savedNotesTab = container.querySelector('.space-tools')?.dataset?.activeTab ?? 'notas';
  const preserveCenterScroll =
    pendingCenterScrollRestore != null || (sameTreatment && forceFullRender);
  const keepNotes = sameTreatment ? container.querySelector('#rightsidebar') : null;
  if (keepNotes) keepNotes.remove();

  container._unmountHighlight?.();
  container._unmountHighlight = null;

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
              ? sidebarCategoryHtml(sessions, activeModule, moduleLabel, {
                  treatmentId,
                  linkHtmlFn: indexModuleLinkHtml,
                })
              : `${sessions.map((s) => sidebarSessionHtml(s, activeModule, { treatmentId, expandSessionId })).join('')}
          ${sidebarAddRowHtml({ id: 'btn-add-session', extraClass: 'workspace-add-session', label: t('workspace.addSession') })}`
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

  if (keepNotes) {
    container.querySelector('#rightsidebar')?.replaceWith(keepNotes);
    restoreNotesScroll(container, savedNotesScroll);
  }

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
  container._workspaceData = {
    treatmentId,
    treatment,
    sessions,
    onNavigate,
    activeSessionId,
    activeModuleId: activeModule?.id,
    activeModuleType: activeModule?.module_type || '',
    refreshWorkspace: async (nextModuleId, nextSessionId) => {
      const data = container._workspaceData;
      if (!data) return;
      if (!(await flushWorkspaceSaves())) return;
      data.sessions = await getSessionsWithModules(treatmentId);
      data.treatment = (await getTreatment(treatmentId)) || data.treatment;
      await paintCenterForModule(container, {
        sessionId: nextSessionId ?? data.activeSessionId,
        moduleId: nextModuleId ?? data.activeModuleId,
        preserveScroll: true,
      });
    },
    async onSwap(modId, sessId) {
      const next = await swapModuleToSelector(modId);
      // In situ: mismo moduleId → refresh con preserveScroll (no navegar al final).
      await container._workspaceData?.refreshWorkspace?.(
        next.moduleId,
        next.sessionId || sessId,
      );
    },
    async onAddSession() {
      const id = await addSession(treatmentId);
      const mods = await getSessionModules(id);
      const sel = mods.find((m) => m.module_type === 'selector_modulo');
      onNavigate({ view: 'workspace', treatmentId, sessionId: id, moduleId: sel?.id });
    },
    async onDelete(deletedId) {
      const data = container._workspaceData;
      const root = container.querySelector('#workspace-center-scroll');
      pendingCenterScrollRestore = root?.scrollTop ?? 0;
      const list = await getSessionsWithModules(treatmentId);
      if (data) data.sessions = list;
      const currentId = data?.activeModuleId;
      const wasActive = String(deletedId) === String(currentId);
      const remaining = list.flatMap((s) => s.modules || []);
      const sameSession = list.find((s) => String(s.id) === String(data?.activeSessionId));
      const next = wasActive
        ? sameSession?.modules?.[0] || remaining[0]
        : remaining.find((m) => String(m.id) === String(currentId)) || remaining[0];
      const sess = next
        ? list.find((s) => (s.modules || []).some((m) => String(m.id) === String(next.id)))
        : null;
      await renderWorkspace(container, {
        treatmentId,
        sessionId: sess?.id ?? data?.activeSessionId ?? activeSessionId,
        moduleId: next?.id,
        onNavigate,
        forceFullRender: true,
      });
    },
  };
  if (sessions.length) {
    await renderAllCenterModules(centerHost, sessions, treatment, activeModule, {
      treatmentId,
      activeSessionId,
      activeModule,
      indexMode,
      indexType,
      onNavigate,
      refreshWorkspace: container._workspaceData.refreshWorkspace,
      onSwap: (...args) => container._workspaceData.onSwap(...args),
      onAddSession: () => container._workspaceData.onAddSession(),
      onDelete: (deletedId) => container._workspaceData.onDelete(deletedId),
    });
  }
  if (keepNotes) restoreNotesScroll(container, savedNotesScroll);

  if (
    activeModule &&
    (!moduleId || (indexMode === 'category' && String(activeModule.id) !== String(moduleId)))
  ) {
    replaceWorkspaceHash({
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
          if (keepNotes) restoreNotesScroll(container, savedNotesScroll);
        });
      } else if (firstPaint) {
        root.scrollTop = 0;
        reveal();
      } else {
        // Módulo distinto (p. ej. +Agregar → selector nuevo): forzar tope del card.
        scrollToModule(container, activeModule.id, { force: true });
        requestAnimationFrame(() => {
          if (!root.isConnected) return;
          scrollToModule(container, activeModule.id, { force: true });
          reveal();
          if (keepNotes) restoreNotesScroll(container, savedNotesScroll);
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
    teardownInteractiveHtml('all');
    onNavigate({ view: 'treatments' });
  });

  container._shareAppliedAbort?.abort();
  const shareAppliedAbort = new AbortController();
  container._shareAppliedAbort = shareAppliedAbort;
  document.addEventListener(
    'telar:share-applied',
    (event) => {
      if (!container.isConnected) return;
      const items = event.detail?.items || [];
      if (!items.some((item) => String(item.treatmentId) === String(treatmentId))) return;
      const root = container.querySelector('#workspace-center-scroll');
      pendingCenterScrollRestore = root?.scrollTop ?? 0;
      const s = container._workspaceRenderState || {};
      void renderWorkspace(container, {
        treatmentId: s.treatmentId ?? treatmentId,
        sessionId: s.sessionId ?? activeSessionId,
        moduleId: s.moduleId ?? activeModule?.id,
        onNavigate: s.onNavigate ?? onNavigate,
        forceFullRender: true,
      });
    },
    { signal: shareAppliedAbort.signal },
  );

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
  if (container._workspaceData) {
    container._workspaceData.goToAdded = goToAdded;
    container._workspaceData.activeSessionId = activeSessionId;
    container._workspaceData.activeModuleType = activeModule?.module_type || '';
  }
  bindWorkspaceDelegatedClicks(container);

  const toolsOpts = {
    treatmentId,
    onNavigate,
    onJumpToModuleType: async (moduleType) => {
      const found = await findModuleInTreatment(treatmentId, moduleType);
      if (!found) {
        toast('Ese módulo no está en este tratamiento');
        return;
      }
      void selectModuleInPlace(container, {
        treatmentId,
        sessionId: found.session_id,
        moduleId: found.module_id,
        moduleType,
        onNavigate,
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
      const s = container._workspaceRenderState || {};
      await renderWorkspace(container, {
        treatmentId: s.treatmentId ?? treatmentId,
        sessionId: s.sessionId ?? activeSessionId,
        moduleId: s.moduleId ?? activeModule?.id,
        onNavigate: s.onNavigate ?? onNavigate,
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
  bindDoneDots(container);
  bindSessionDoneDots(container);

  let notesApi = container._notesApi;
  if (!keepNotes || !rightSidebarEl?.querySelector('.space-tools')) {
    notesApi = await mountNotesPanel(rightSidebarEl, treatmentId, {
      ...toolsOpts,
      initialNotesScroll: savedNotesScroll,
    });
    container._notesApi = notesApi;
    if (savedNotesTab && savedNotesTab !== 'notas') {
      const tabBtn = container.querySelector(`.space-tab2[data-tab="${savedNotesTab}"]`);
      if (tabBtn) tabBtn.click();
    }
  } else {
    restoreNotesScroll(container, savedNotesScroll);
  }

  container._unmountHighlight = mountTextHighlight(centerHost, {
    treatmentId,
    onNoteCreated: async () => {
      await notesApi?.focusNotasTab();
    },
  });

  container.dataset.workspaceTreatmentId = String(treatmentId);
  container.dataset.workspaceModuleId = activeModule ? String(activeModule.id) : '';
  container.dataset.workspaceIndexMode = indexMode;
  container.dataset.workspaceIndexType = indexType || '';
  container._workspaceRenderState = {
    treatmentId,
    sessionId: activeSessionId,
    moduleId: activeModule?.id,
    onNavigate,
  };

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

function replaceWorkspaceHash({ treatmentId, sessionId, moduleId }) {
  const next = new URLSearchParams();
  if (treatmentId != null && treatmentId !== '') next.set('t', String(treatmentId));
  if (sessionId != null && sessionId !== '') next.set('s', String(sessionId));
  if (moduleId != null && moduleId !== '') next.set('m', String(moduleId));
  const hash = `/workspace?${next}`;
  if (location.hash.slice(1) === hash) return;
  history.replaceState(null, '', `#${hash}`);
}

async function selectModuleInPlace(
  container,
  { treatmentId, sessionId, moduleId, moduleType, onNavigate },
) {
  const indexMode = getWorkspaceIndexMode();
  if (indexMode === 'category' && moduleType) setWorkspaceIndexType(moduleType);
  const indexType = indexMode === 'category' ? getWorkspaceIndexType() || moduleType || '' : '';
  const card = container.querySelector(`#module-${moduleId}`);
  const ok = await tryFastModuleNavigation(container, {
    treatmentId,
    sessionId,
    moduleId,
    activeModule: { id: moduleId, module_type: moduleType || card?.dataset.moduleType || '' },
    indexMode,
    indexType,
  });
  if (ok) {
    replaceWorkspaceHash({ treatmentId, sessionId, moduleId });
    return;
  }
  if (await paintCenterForModule(container, { sessionId, moduleId, moduleType })) {
    replaceWorkspaceHash({ treatmentId, sessionId, moduleId });
    return;
  }
  onNavigate({
    view: 'workspace',
    treatmentId,
    sessionId,
    moduleId,
  });
}

function bindWorkspaceDelegatedClicks(container) {
  if (container.dataset.workspaceClicksBound === '1') return;
  container.dataset.workspaceClicksBound = '1';
  container.addEventListener('click', (e) => {
    const data = container._workspaceData;
    if (!data) return;

    const link = e.target.closest('.module-link');
    if (link && container.contains(link)) {
      e.preventDefault();
      const type = link.dataset.indexType;
      if (type) setWorkspaceIndexType(type);
      if (type && data.activeModuleType === type) return;
      void selectModuleInPlace(container, {
        treatmentId: data.treatmentId,
        sessionId: link.dataset.sessionId,
        moduleId: link.dataset.moduleId,
        moduleType: link.dataset.moduleType || type || '',
        onNavigate: data.onNavigate,
      });
      return;
    }

    const addSessionMod = e.target.closest('.btn-add-module[data-session-id], .center-add-module');
    if (addSessionMod && container.contains(addSessionMod)) {
      void openSessionSelector(
        data.treatmentId,
        Number(addSessionMod.dataset.sessionId),
        data.onNavigate,
      );
      return;
    }

    const addCat = e.target.closest('.btn-add-module[data-category-id]');
    if (addCat && container.contains(addCat)) {
      void openAddModuleSessionModal({
        treatmentId: data.treatmentId,
        categoryId: addCat.dataset.categoryId,
        preferredSessionId: data.activeSessionId,
        onAdded: data.goToAdded,
      });
      return;
    }

    const addSame = e.target.closest('.center-add-same-type');
    if (addSame && container.contains(addSame)) {
      void openAddModuleSessionModal({
        treatmentId: data.treatmentId,
        presetType: addSame.dataset.moduleType,
        preferredSessionId: data.activeSessionId,
        onAdded: data.goToAdded,
      });
      return;
    }

    const addSessionBtn = e.target.closest('#btn-add-session');
    if (addSessionBtn && container.contains(addSessionBtn)) {
      void data.onAddSession?.();
    }
  });
}

async function paintCenterForModule(container, { sessionId, moduleId, moduleType = '', preserveScroll = false } = {}) {
  const data = container._workspaceData;
  if (!data?.treatment || !data.sessions) return false;
  const host = container.querySelector('#center-modules');
  if (!host) return false;

  if (!(await flushWorkspaceSaves())) return false;

  const indexMode = getWorkspaceIndexMode();
  if (indexMode === 'category' && moduleType) setWorkspaceIndexType(moduleType);
  const indexType = indexMode === 'category' ? getWorkspaceIndexType() || moduleType || '' : '';

  let activeModule = null;
  let activeSessionId = sessionId;
  const wanted = moduleId != null && moduleId !== '' ? String(moduleId) : '';
  for (const session of data.sessions) {
    const found = (session.modules || []).find((mod) => String(mod.id) === wanted);
    if (found) {
      activeModule = found;
      activeSessionId = session.id;
      break;
    }
  }
  if (!activeModule && indexMode === 'category' && indexType) {
    const match = data.sessions
      .flatMap((session) => (session.modules || []).map((mod) => ({ session, module: mod })))
      .find((row) => row.module.module_type === indexType);
    if (match) {
      activeModule = match.module;
      activeSessionId = match.session.id;
    }
  }
  if (!activeModule) {
    const session =
      data.sessions.find((row) => String(row.id) === String(sessionId)) || data.sessions[0];
    activeSessionId = session?.id;
    activeModule = session?.modules?.[0] || null;
  }
  if (!activeModule) return false;

  data.activeSessionId = activeSessionId;
  data.activeModuleId = activeModule.id;
  data.activeModuleType = activeModule.module_type || '';
  container.dataset.workspaceModuleId = String(activeModule.id);
  container.dataset.workspaceIndexMode = indexMode;
  container.dataset.workspaceIndexType = indexType || '';
  container._workspaceRenderState = {
    ...(container._workspaceRenderState || {}),
    treatmentId: data.treatmentId,
    sessionId: activeSessionId,
    moduleId: activeModule.id,
    onNavigate: data.onNavigate,
  };

  const savedNotesScroll = captureNotesScroll(container);
  const centerRoot = container.querySelector('#workspace-center-scroll');
  const pinEl = host.querySelector(`#module-${activeModule.id}`);
  const pinOffset = preserveScroll ? moduleViewportOffset(centerRoot, pinEl) : null;
  const savedCenterScroll = preserveScroll ? centerRoot?.scrollTop ?? 0 : null;
  const previousHeights = snapshotModuleCardHeights(host);

  if (
    await tryPaintCenterModuleInPlace(container, {
      activeModule,
      activeSessionId,
      indexMode,
      indexType,
      preserveScroll,
      pinOffset,
    })
  ) {
    restoreNotesScroll(container, savedNotesScroll);
    return true;
  }

  container._unmountCenterScrollSpy?.();
  await renderAllCenterModules(host, data.sessions, data.treatment, activeModule, {
    treatmentId: data.treatmentId,
    activeSessionId,
    activeModule,
    indexMode,
    indexType,
    previousHeights,
    onNavigate: data.onNavigate,
    refreshWorkspace: data.refreshWorkspace,
    onSwap: data.onSwap,
    onAddSession: data.onAddSession,
    onDelete: data.onDelete,
  });
  bindModuleScrollSpy(container);
  paintLeftSidebarIndex(container, data.sessions, activeModule);
  setActiveModuleHighlight(container, activeModule.id, activeModule.module_type);
  const painted = host.querySelector(`#module-${activeModule.id}`);
  if (preserveScroll && pinOffset != null && painted && centerRoot) {
    scheduleRestoreModuleViewportOffset(centerRoot, painted, pinOffset);
  } else if (preserveScroll && centerRoot) {
    const y = savedCenterScroll;
    centerRoot.scrollTop = y;
    requestAnimationFrame(() => {
      if (centerRoot.isConnected) centerRoot.scrollTop = y;
      requestAnimationFrame(() => {
        if (centerRoot.isConnected) centerRoot.scrollTop = y;
      });
    });
  } else {
    scrollToModule(container, activeModule.id, { force: true });
  }
  scrollSidebarToModule(container, activeModule.id);
  restoreNotesScroll(container, savedNotesScroll);
  return true;
}

function centerBotoneraOpts(mod, session, treatment, wrap, ctx) {
  const deletable = canDeleteModule(mod, session.modules);
  const customMod = getCustomModuleByType(mod.module_type);
  const interactiveMod = customMod?.kind === 'interactive';
  const handout = interactiveMod
    ? customMod.pdfPath
      ? { attached: true }
      : null
    : tccHandoutDef(mod.module_type) ||
      customModuleHandoutPayload(mod.module_type, parseJsonSafe(mod.data, {}))?.def;
  const swappable = !['registro_inicial', 'motivo_consulta', 'selector_modulo'].includes(
    mod.module_type,
  );
  const isNf = mod.module_type === 'neurofeedback';
  const shareable = shareableContentFor(mod.module_type);
  return {
    swappable,
    handout,
    deletable,
    isNf,
    shareState: shareable ? (shareInfo(mod.data) ? 'pending' : 'ready') : null,
    shareAnswered: shareable ? shareAnsweredAt(mod.data) : null,
    moduleLabelText: moduleLabel(mod.module_type),
    onSwap: () => ctx.onSwap(mod.id, session.id),
    onPrint: () => printModulePdf(mod, treatment.patient_name),
    onShare: () =>
      openShareModuleModal(mod, {
        label: moduleLabel(mod.module_type),
        ...shareable,
        onChange: () => ctx.refreshWorkspace?.(),
      }),
    onDelete: async () => {
      if (wrap.dataset.deleting === '1') return;
      wrap.dataset.deleting = '1';
      try {
        await deleteSessionModule(mod.id);
        toast('Módulo eliminado');
        await ctx.onDelete(mod.id);
      } catch (err) {
        wrap.dataset.deleting = '';
        throw err;
      }
    },
  };
}

function ensureCenterAddModuleButton(wrap, session, indexMode) {
  if (indexMode === 'category') return;
  const lastMod = session.modules?.[session.modules.length - 1];
  const next = wrap.nextElementSibling;
  const existingAdd = next?.classList.contains('center-add-module') ? next : null;
  if (!lastMod || lastMod.module_type === 'selector_modulo') {
    existingAdd?.remove();
    return;
  }
  if (String(wrap.dataset.moduleId) !== String(lastMod.id)) return;
  if (existingAdd) return;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-secondary btn-block center-add-module';
  addBtn.dataset.sessionId = session.id;
  addBtn.title = 'Añadir módulo a esta sesión';
  addBtn.textContent = '+ Agregar módulo';
  wrap.insertAdjacentElement('afterend', addBtn);
}

async function tryPaintCenterModuleInPlace(
  container,
  { activeModule, activeSessionId, indexMode, indexType, preserveScroll, pinOffset },
) {
  const data = container._workspaceData;
  const host = container.querySelector('#center-modules');
  if (!data?.treatment || !host?._hydrateModule || !host._centerPending) return false;

  const displaySessions = sessionsForCenter(data.sessions, {
    indexMode,
    indexType,
    sessionId: activeSessionId,
    moduleId: activeModule.id,
  });
  if (!centerModuleIdsMatch(host, displaySessions)) return false;

  const item = host._centerPending.find(
    (row) => String(row.mod.id) === String(activeModule.id),
  );
  if (!item?.wrap?.isConnected) return false;
  if (item.wrap.dataset.moduleType === activeModule.module_type) return false;

  const freshSession =
    displaySessions.find((session) =>
      (session.modules || []).some((mod) => String(mod.id) === String(activeModule.id)),
    ) || data.sessions.find((session) => String(session.id) === String(activeSessionId));
  if (!freshSession) return false;

  const centerRoot = container.querySelector('#workspace-center-scroll');
  item.session = freshSession;
  item.mod = activeModule;
  item.botoneraOpts = centerBotoneraOpts(activeModule, freshSession, data.treatment, item.wrap, {
    onNavigate: data.onNavigate,
    refreshWorkspace: data.refreshWorkspace,
    onSwap: data.onSwap,
    onDelete: data.onDelete,
  });

  item.wrap.dataset.moduleType = activeModule.module_type;
  item.wrap.classList.toggle(
    'center-module-card--selector',
    activeModule.module_type === 'selector_modulo',
  );
  item.wrap.querySelectorAll(':scope > .module-card-actions, :scope > .botonera-modules').forEach((el) => {
    el.remove();
  });
  const body = item.wrap.querySelector('.center-module-card__body');
  if (body) body.innerHTML = '';
  item.wrap.dataset.hydrated = '0';
  item.wrap.style.minHeight = '';

  try {
    await host._hydrateModule(activeModule.id);
  } catch {
    return false;
  }
  ensureCenterAddModuleButton(item.wrap, freshSession, indexMode);
  paintLeftSidebarIndex(container, data.sessions, activeModule);
  setActiveModuleHighlight(container, activeModule.id, activeModule.module_type);
  scrollSidebarToModule(container, activeModule.id);

  if (preserveScroll && pinOffset != null && centerRoot) {
    scheduleRestoreModuleViewportOffset(centerRoot, item.wrap, pinOffset);
  } else {
    scrollToModule(container, activeModule.id, { force: true });
  }
  return true;
}

function paintLeftSidebarIndex(container, sessions, activeModule) {
  const data = container._workspaceData;
  if (!data || !sessions) return;
  const scroll = container.querySelector('#leftsidebar .workspace-sidebar__scroll');
  if (!scroll) return;
  snapshotSessionCollapse(container, data.treatmentId);
  snapshotCategoryCollapse(container, data.treatmentId);
  const saved = scroll.scrollTop;
  const indexMode = getWorkspaceIndexMode();
  scroll.innerHTML =
    indexMode === 'category'
      ? sidebarCategoryHtml(sessions, activeModule, moduleLabel, {
          treatmentId: data.treatmentId,
          linkHtmlFn: indexModuleLinkHtml,
        })
      : `${sessions
          .map((s) => sidebarSessionHtml(s, activeModule, { treatmentId: data.treatmentId }))
          .join('')}
          ${sidebarAddRowHtml({
            id: 'btn-add-session',
            extraClass: 'workspace-add-session',
            label: t('workspace.addSession'),
          })}`;
  scroll.scrollTop = saved;
  bindSessionCollapse(container, activeModule, data.treatmentId);
  bindCategoryCollapse(container, activeModule, data.treatmentId);
  bindDoneDots(container);
  bindSessionDoneDots(container);
  if (indexMode !== 'category') {
    bindWorkspaceModuleDnD(container, {
      treatmentId: data.treatmentId,
      activeModuleId: activeModule?.id,
      onNavigate: data.onNavigate,
      onMoved: async ({ sessionId: movedSessionId, moduleId: movedModuleId }) => {
        const root = container.querySelector('#workspace-center-scroll');
        pendingCenterScrollRestore = root?.scrollTop ?? 0;
        await renderWorkspace(container, {
          treatmentId: data.treatmentId,
          sessionId: movedSessionId,
          moduleId: movedModuleId ?? activeModule?.id,
          onNavigate: data.onNavigate,
          forceFullRender: true,
          expandSessionId: movedSessionId,
        });
      },
    });
  }
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

  if (card.dataset.hydrated !== '1') {
    const host = container.querySelector('#center-modules');
    await host?._hydrateModule?.(moduleId);
  }

  // Tras reemplazar el selector, el id es el mismo pero el tipo cambió — hay que re-renderizar.
  if (
    card.dataset.moduleType &&
    activeModule.module_type &&
    card.dataset.moduleType !== activeModule.module_type
  ) {
    return false;
  }

  const switchedModule = container.dataset.workspaceModuleId !== String(moduleId);
  container.dataset.workspaceModuleId = String(moduleId);
  if (sessionId != null) container.dataset.workspaceSessionId = String(sessionId);
  container._workspaceRenderState = {
    ...(container._workspaceRenderState || {}),
    treatmentId,
    sessionId,
    moduleId,
  };
  if (container._workspaceData) {
    container._workspaceData.activeSessionId = sessionId ?? container._workspaceData.activeSessionId;
    container._workspaceData.activeModuleId = moduleId;
    container._workspaceData.activeModuleType = activeModule.module_type || '';
  }

  bindSessionCollapse(container, activeModule, treatmentId);
  setActiveModuleHighlight(container, moduleId, activeModule.module_type);
  // QA-006: al saltar a otro módulo (p. ej. selector recién abierto), forzar tope del card.
  scrollToModule(container, moduleId, { force: switchedModule });
  scrollSidebarToModule(container, moduleId);
  return true;
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
    if (!root.isConnected || !el.isConnected) return;
    const next = nextScrollTopForModule(
      root.getBoundingClientRect(),
      el.getBoundingClientRect(),
      root.scrollTop,
      { force, pad: 20 },
    );
    if (next != null) {
      if (typeof root.scrollTo === 'function') {
        root.scrollTo({
          top: next,
          behavior: force || !smooth ? 'auto' : 'smooth',
        });
      } else {
        root.scrollTop = next;
      }
    }
    setActiveModuleHighlight(container, moduleId, el.dataset.moduleType);
  };

  run();
  if (typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => {
    run();
    if (force) requestAnimationFrame(run);
  });
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

const KEEP_HYDRATED_TYPES = new Set([
  'neurofeedback',
  'bilateral_stimulation',
  'registro_inicial',
  'motivo_consulta',
]);

function cardContainsFocus(wrap) {
  const ae = typeof document !== 'undefined' ? document.activeElement : null;
  return Boolean(ae && wrap.contains(ae));
}

function shouldKeepModuleMounted(wrap, moduleType) {
  if (!wrap) return true;
  if (KEEP_HYDRATED_TYPES.has(moduleType)) return true;
  if (wrap.classList.contains('center-module-card--active')) return true;
  if (cardContainsFocus(wrap)) return true;
  return false;
}

function bindModuleScrollSpy(container) {
  container._unmountCenterScrollSpy?.();
  const root = container.querySelector('#workspace-center-scroll');
  const cards = [...container.querySelectorAll('.center-module-card')];
  if (!root || !cards.length) return;

  const visible = new Set();
  let ticking = false;
  const pickVisible = () => {
    const rootRect = root.getBoundingClientRect();
    const mid = rootRect.top + rootRect.height * 0.35;
    let best = null;
    let bestDist = Infinity;
    visible.forEach((card) => {
      if (!card.isConnected) {
        visible.delete(card);
        return;
      }
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
      if (best.dataset.hydrated !== '1') {
        void container.querySelector('#center-modules')?._hydrateModule?.(best.dataset.moduleId);
      }
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

  let spyIo = null;
  if (typeof IntersectionObserver === 'function') {
    spyIo = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        onScroll();
      },
      { root, rootMargin: '0px', threshold: 0 },
    );
    for (const card of cards) spyIo.observe(card);
  } else {
    for (const card of cards) visible.add(card);
  }

  const rootRect = root.getBoundingClientRect();
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (r.bottom >= rootRect.top + 8 && r.top <= rootRect.bottom - 8) visible.add(card);
  }

  root.addEventListener('scroll', onScroll, { passive: true });
  container._unmountCenterScrollSpy = () => {
    root.removeEventListener('scroll', onScroll);
    spyIo?.disconnect();
    container._unmountCenterScrollSpy = null;
  };
  pickVisible();
}

function createBotoneraEl({ isActive }) {
  const actions = document.createElement('div');
  actions.className = 'module-card-actions botonera-modules';
  if (isActive) actions.id = 'botoneraModules';
  return actions;
}

function appendBotoneraCore(actions, { swappable, handout, deletable, isNf, shareState, shareAnswered, moduleLabelText, onSwap, onPrint, onDelete, onShare }) {
  // Derecha → izquierda: cerrar, cambiar, imprimir, enviar, ayuda.
  if (shareAnswered) {
    const when = formatShareAnsweredAt(shareAnswered);
    const tag = document.createElement('span');
    tag.className = 'share-answered-tag';
    tag.title = when ? `${shareCompletedByLinkLabel()} · ${when}` : shareCompletedByLinkLabel();
    tag.innerHTML = `<span class="share-answered-tag__label">${shareCompletedByLinkLabel()}</span>${
      when ? `<span class="share-answered-tag__when">${escapeHtml(when)}</span>` : ''
    }`;
    actions.appendChild(tag);
  }

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

  if (shareState) {
    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = `module-print-btn${shareState === 'pending' ? ' module-print-btn--active' : ''}`;
    const label =
      shareState === 'pending'
        ? 'Enlace enviado — esperando respuesta'
        : 'Enviar al paciente por enlace';
    shareBtn.title = label;
    shareBtn.setAttribute('aria-label', label);
    shareBtn.innerHTML = ICON_LINK;
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onShare();
    });
    actions.appendChild(shareBtn);
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
  host._hydrateObserver?.disconnect();
  host._hydrateObserver = null;
  host._centerPending = null;
  host.innerHTML = '';
  host._hydrateModule = null;

  const indexMode = ctx.indexMode || 'chrono';
  const indexType = ctx.indexType || '';
  const displaySessions = sessionsForCenter(sessions, {
    indexMode,
    indexType,
    sessionId: ctx.activeSessionId,
    moduleId: activeModule?.id,
  });

  const pending = [];

  for (let si = 0; si < displaySessions.length; si++) {
    const session = displaySessions[si];
    host.insertAdjacentHTML('beforeend', sessionRuleHtml(session.number));

    for (const mod of session.modules) {
      const isActive = activeModule && String(mod.id) === String(activeModule.id);
      const wrap = document.createElement('article');
      wrap.className = `center-module-card${isActive ? ' center-module-card--active' : ''}`;
      wrap.id = `module-${mod.id}`;
      wrap.dataset.moduleId = mod.id;
      wrap.dataset.sessionId = session.id;
      wrap.dataset.moduleType = mod.module_type;
      wrap.dataset.sessionNumber = session.number;
      const prevH = !isActive ? ctx.previousHeights?.get(String(mod.id)) : null;
      if (prevH) wrap.style.minHeight = `${Math.round(prevH)}px`;

      const botoneraOpts = centerBotoneraOpts(mod, session, treatment, wrap, ctx);

      const body = document.createElement('div');
      body.className = 'center-module-card__body';
      wrap.appendChild(body);
      wrap.dataset.hydrated = '0';
      host.appendChild(wrap);
      pending.push({ wrap, mod, session, botoneraOpts });
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

    const lastSession = sessions[sessions.length - 1];
    if (
      indexMode !== 'category' &&
      ctx.onAddSession &&
      lastSession &&
      String(session.id) === String(lastSession.id)
    ) {
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
    host._centerPending = [];
    return;
  }

  const hydrating = new Map();
  const hydrateOne = (item) => {
    if (!item || !item.wrap.isConnected) return Promise.resolve();
    if (item.wrap.dataset.hydrated === '1' || item.wrap.dataset.hydrated === 'pending') {
      return hydrating.get(String(item.mod.id)) || Promise.resolve();
    }
    const id = String(item.mod.id);
    const existing = hydrating.get(id);
    if (existing) return existing;
    const job = (async () => {
      item.wrap.dataset.hydrated = 'pending';
      try {
        const body = item.wrap.querySelector('.center-module-card__body');
        if (!body) {
          item.wrap.dataset.hydrated = '0';
          return;
        }
        const fresh = await getModule(item.mod.id);
        if (!item.wrap.isConnected) {
          item.wrap.dataset.hydrated = '0';
          return;
        }
        if (fresh) {
          item.mod.data = fresh.data;
          item.mod.status = fresh.status;
        }
        const actions = createBotoneraEl({
          isActive: item.wrap.classList.contains('center-module-card--active'),
        });
        appendBotoneraCore(actions, item.botoneraOpts);
        await renderModule(body, item.mod, {
          treatment,
          sessionNumber: item.session.number,
          patientName: treatment.patient_name,
          onNavigate: ctx.onNavigate,
          refreshWorkspace: ctx.refreshWorkspace,
        });
        attachBotonera(item.wrap, actions);
        item.wrap.style.minHeight = '';
        item.wrap.dataset.hydrated = '1';
      } catch (err) {
        item.wrap.dataset.hydrated = '0';
        throw err;
      } finally {
        hydrating.delete(id);
      }
    })();
    hydrating.set(id, job);
    return job;
  };

  const unhydrateOne = async (item) => {
    const wrap = item?.wrap;
    if (!wrap?.isConnected) return;
    if (wrap.dataset.hydrated !== '1') return;
    if (hydrating.has(String(item.mod.id))) return;
    if (shouldKeepModuleMounted(wrap, item.mod.module_type)) return;
    if (!(await flushWorkspaceSaves())) return;
    if (!wrap.isConnected) return;
    if (wrap.dataset.hydrated !== '1') return;
    if (hydrating.has(String(item.mod.id))) return;
    if (shouldKeepModuleMounted(wrap, item.mod.module_type)) return;
    teardownInteractiveHtml(item.mod.id);
    const height = wrap.getBoundingClientRect().height;
    wrap.style.minHeight = `${Math.max(160, Math.round(height))}px`;
    const body = wrap.querySelector('.center-module-card__body');
    if (body) body.innerHTML = '';
    wrap.dataset.hydrated = '0';
  };

  host._centerPending = pending;
  host._hydrateModule = (moduleId) => {
    const item = pending.find((row) => String(row.mod.id) === String(moduleId));
    return hydrateOne(item);
  };

  const activeItem =
    pending.find((item) => activeModule && String(item.mod.id) === String(activeModule.id)) ||
    pending[0];
  if (activeItem) await hydrateOne(activeItem);

  const scrollRoot = host.closest('#workspace-center-scroll');
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const item = pending.find((row) => row.wrap === entry.target);
          if (!item) continue;
          if (entry.isIntersecting) void hydrateOne(item);
          else void unhydrateOne(item);
        }
      },
      { root: scrollRoot, rootMargin: '200px 0px', threshold: 0 },
    );
    host._hydrateObserver = io;
    for (const item of pending) io.observe(item.wrap);
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

function doneDotTitle(label, done) {
  return done ? `${label}: completado` : `${label}: pendiente`;
}

function applyDoneDotState(btn, done, label) {
  btn.classList.toggle('is-done', done);
  btn.setAttribute('aria-pressed', done ? 'true' : 'false');
  const title = doneDotTitle(label, done);
  btn.setAttribute('aria-label', title);
  btn.setAttribute('title', title);
}

function moduleDoneDotHtml(mod) {
  if (!mod || mod.module_type === 'selector_modulo') {
    return '<span class="module-done-dot module-done-dot--spacer" aria-hidden="true"></span>';
  }
  const label = moduleLabel(mod.module_type);
  const done = isModuleDone(mod.module_type, mod.data);
  const title = doneDotTitle(label, done);
  return `<button type="button" class="module-done-dot${done ? ' is-done' : ''}" data-done-toggle data-module-id="${mod.id}" aria-pressed="${done ? 'true' : 'false'}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}"></button>`;
}

function sessionDoneDotHtml(session) {
  const done = isSessionDone(session);
  const label = `${t('workspace.session')} ${session.number}`;
  const title = doneDotTitle(label, done);
  return `<button type="button" class="module-done-dot${done ? ' is-done' : ''}" data-session-done data-session-id="${session.id}" data-session-number="${session.number}" aria-pressed="${done ? 'true' : 'false'}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}"></button>`;
}

function indexModuleLinkHtml({ first, active, count, label }) {
  const extra = count > 1 ? `<span class="module-index-count">${count}</span>` : '';
  return `<div class="module-row">${moduleDoneDotHtml(first.module)}<a href="#" class="module-link module-link--index${active ? ' active' : ''}" data-index-type="${escapeHtml(first.module.module_type)}" data-session-id="${first.session.id}" data-module-id="${first.module.id}"><span class="module-link__label">${escapeHtml(label)}</span>${extra}</a></div>`;
}

function bindDoneDots(container) {
  if (container.dataset.doneDotsBound === '1') return;
  container.dataset.doneDotsBound = '1';
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-done-toggle]');
    if (!btn || !container.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const row = await getModule(btn.dataset.moduleId);
      if (!row || row.module_type === 'selector_modulo') return;
      const data = parseJsonSafe(row.data, {});
      const patch = toggleDoneOverride(row.module_type, data);
      await syncModuleReadableText(row, patch, row.status);
      const done = isModuleDone(row.module_type, { ...data, ...patch });
      const label = moduleLabel(row.module_type);
      container.querySelectorAll(`[data-done-toggle][data-module-id="${row.id}"]`).forEach((el) => {
        applyDoneDotState(el, done, label);
      });
      toast(doneToastMessage(label, done));
    } catch (err) {
      toast(err?.message || 'No se pudo actualizar el estado');
    } finally {
      btn.disabled = false;
    }
  });
}

function bindSessionDoneDots(container) {
  if (container.dataset.sessionDoneBound === '1') return;
  container.dataset.sessionDoneBound = '1';
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-session-done]');
    if (!btn || !container.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const next = !btn.classList.contains('is-done');
      await setSessionDone(btn.dataset.sessionId, next);
      const label = `${t('workspace.session')} ${btn.dataset.sessionNumber || ''}`.trim();
      applyDoneDotState(btn, next, label);
      const data = container._workspaceData;
      const sess = data?.sessions?.find((s) => String(s.id) === String(btn.dataset.sessionId));
      if (sess) sess.done = next ? 1 : 0;
      toast(next ? `${label}: completada` : `${label}: pendiente`);
    } catch (err) {
      toast(err?.message || 'No se pudo actualizar la sesión');
    } finally {
      btn.disabled = false;
    }
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
      const label = moduleLabel(m.module_type);
      return `<div class="module-row">${moduleDoneDotHtml(m)}<a href="#" class="module-link${active ? ' active' : ''}" data-session-id="${session.id}" data-module-id="${m.id}" data-module-type="${escapeHtml(m.module_type)}" data-draggable="${draggable ? 'true' : 'false'}"><span class="module-link__label">${escapeHtml(label)}</span></a></div>`;
    })
    .join('');

  return `
    <section class="session-block${startCollapsed ? ' session-block--collapsed' : ''}${activeInSession ? ' session-block--active' : ''}" data-session-id="${session.id}">
      <div class="module-row session-block__head">
        ${sessionDoneDotHtml(session)}
        <button type="button" class="session-block__title" data-session-toggle aria-expanded="${startCollapsed ? 'false' : 'true'}">
          <span class="session-block__label">${escapeHtml(t('workspace.session'))} ${session.number}</span>
        </button>
      </div>
      <div class="session-block__body">
        <nav class="session-block__modules">${mods || `<span class="text-muted">${escapeHtml(t('workspace.noModules'))}</span>`}</nav>
        ${
          sessionHasModuleLibrary(session.modules)
            ? ''
            : sidebarAddRowHtml({
                sessionId: session.id,
                extraClass: 'btn-add-module',
                label: t('workspace.addModule'),
              })
        }
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
