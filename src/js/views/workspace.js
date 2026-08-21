import { customModuleHandoutPayload, moduleLabelFor } from '../custom-modules.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { mountNotesPanel } from '../components/notes-panel.js';
import { bindWorkspaceModuleDnD } from '../components/workspace-dnd.js';
import { mountTextHighlight } from '../components/text-highlight.js';
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
import { openWorkspacePatientMenu } from '../components/workspace-patient-menu.js';
import { initWorkspaceSidebarResizers } from '../components/workspace-layout.js';
import { isTauriApp, getInvoke } from '../tauri-bridge.js';
import { flushPendingAutoSaves } from '../autobind.js';

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
  if (!activeModule && sessions.length) {
    const s = sessions.find((x) => String(x.id) === String(sessionId)) || sessions[sessions.length - 1];
    activeSessionId = s.id;
    const mods = s.modules || [];
    activeModule = mods[mods.length - 1] || null;
  }

  const patientLabel = `${escapeHtml(treatment.patient_name)}${treatment.number > 1 ? ` ${treatment.number}` : ''}`;

  if (
    !forceFullRender &&
    await tryFastModuleNavigation(container, {
      treatmentId,
      sessionId: activeSessionId,
      moduleId: activeModule?.id,
      activeModule,
    })
  ) {
    return;
  }

  await flushPendingAutoSaves();

  const prevTreatmentId = container.dataset.workspaceTreatmentId;
  const prevModuleId = container.dataset.workspaceModuleId;
  const prevScrollRoot = container.querySelector('#workspace-center-scroll');
  const prevScrollTop = prevScrollRoot?.scrollTop ?? 0;
  const sameTreatment = prevTreatmentId === String(treatmentId);
  snapshotSessionCollapse(container, treatmentId);
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
          ${sessions.map((s) => sidebarSessionHtml(s, activeModule, { treatmentId, expandSessionId })).join('')}
          <button type="button" class="btn btn-ghost btn-block workspace-add-session" id="btn-add-session" title="${escapeHtml(t('workspace.addSession'))}">${escapeHtml(t('workspace.addSession'))}</button>
        </div>
        <footer class="workspace-sidebar__footer">
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

  if (activeModule && !moduleId) {
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
      } else {
        syncScrollToModule(container, activeModule.id);
        requestAnimationFrame(() => {
          if (!root.isConnected) return;
          syncScrollToModule(container, activeModule.id);
          reveal();
        });
      }
    }
    setActiveModuleHighlight(container, activeModule.id);
    scrollSidebarToModule(container, activeModule.id);
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

  container.querySelectorAll('.module-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const mid = link.dataset.moduleId;
      onNavigate({
        view: 'workspace',
        treatmentId,
        sessionId: link.dataset.sessionId,
        moduleId: mid,
      });
    });
  });

  container.querySelectorAll('.btn-add-module, .center-add-module').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await openSessionSelector(treatmentId, Number(btn.dataset.sessionId), onNavigate);
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

  bindSessionCollapse(container, activeModule, treatmentId);

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
}

async function tryFastModuleNavigation(container, { treatmentId, sessionId, moduleId, activeModule }) {
  if (!moduleId || !activeModule) return false;
  if (container.dataset.workspaceTreatmentId !== String(treatmentId)) return false;
  if (!container.querySelector('#workspace-layout')) return false;
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
  setActiveModuleHighlight(container, moduleId);
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

function setActiveModuleHighlight(container, moduleId) {
  if (!moduleId) return;
  container.querySelectorAll('.module-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.moduleId === String(moduleId));
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
      setActiveModuleHighlight(container, moduleId);
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
    setActiveModuleHighlight(container, moduleId);
  };

  if (force) {
    syncScrollToModule(container, moduleId);
    setActiveModuleHighlight(container, moduleId);
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
      setActiveModuleHighlight(container, best.dataset.moduleId);
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

async function renderAllCenterModules(host, sessions, treatment, activeModule, ctx) {
  teardownBilateralStimulation();
  host.innerHTML = '';

  for (let si = 0; si < sessions.length; si++) {
    const session = sessions[si];
    if (si > 0) {
      host.insertAdjacentHTML('beforeend', '<hr class="session-module-separator" aria-hidden="true" />');
    }

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

      if (handout || deletable || mod.module_type === 'neurofeedback' || swappable) {
        const actions = document.createElement('div');
        actions.className = 'module-card-actions';

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
              message: `¿Deseas reemplazar «${moduleLabel(mod.module_type)}»? Se perderá la información del módulo actual.`,
              confirmLabel: 'Cambiar módulo',
            });
            if (!ok) return;
            try {
              await ctx.onSwap(mod.id, session.id);
            } catch (err) {
              toast(err.message);
            }
          });
          actions.appendChild(swapBtn);
        }

        if (mod.module_type === 'neurofeedback') {
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
              await printModulePdf(mod, treatment.patient_name);
            } catch (err) {
              toast(err.message || 'No se pudo generar el PDF');
            }
          });
          actions.appendChild(printBtn);
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
            const label = moduleLabel(mod.module_type);
            const ok = await openConfirmModal({
              title: '¿Eliminar módulo?',
              message:
                `¿Estás seguro de eliminar «${label}»? La información del módulo no se puede recuperar.`,
              confirmLabel: 'Eliminar módulo',
            });
            if (!ok) return;
            try {
              await deleteSessionModule(mod.id);
              toast('Módulo eliminado');
              await ctx.onDelete(mod.id);
            } catch (err) {
              toast(err.message);
            }
          });
          actions.appendChild(del);
        }

        wrap.appendChild(actions);
      }

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
    }

    const lastMod = session.modules[session.modules.length - 1];
    if (lastMod && lastMod.module_type !== 'selector_modulo') {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-secondary btn-block center-add-module';
      addBtn.dataset.sessionId = session.id;
      addBtn.title = 'Añadir módulo a esta sesión';
      addBtn.textContent = '+ Agregar módulo';
      host.appendChild(addBtn);
    }

    // Botón "+ Agregar sesión" al final de la última sesión
    if (si === sessions.length - 1 && ctx.onAddSession) {
      const addSessionBtn = document.createElement('button');
      addSessionBtn.type = 'button';
      addSessionBtn.className = 'btn btn-ghost btn-block center-add-session';
      addSessionBtn.title = 'Añadir sesión';
      addSessionBtn.textContent = '+ Agregar sesión';
      addSessionBtn.addEventListener('click', () => ctx.onAddSession());
      host.appendChild(addSessionBtn);
    }
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
