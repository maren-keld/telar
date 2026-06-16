import { MODULE_DEFS } from '../config.js';
import { moduleLabelFor } from '../custom-modules.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { mountNotesPanel } from '../components/notes-panel.js';
import { bindWorkspaceModuleDnD } from '../components/workspace-dnd.js';
import { mountTextHighlight } from '../components/text-highlight.js';
import {
  addModuleToSession,
  addSession,
  canDeleteModule,
  deleteSessionModule,
  getSessionModules,
  getSessionsWithModules,
  getTreatment,
} from '../db.js';
import { renderModule, teardownBilateralStimulation } from '../modules/index.js';
import { NF_HELP_MESSAGE, teardownNeurofeedback } from '../modules/neurofeedback.js';
import { exportTreatmentPdf } from '../export-treatment-pdf.js';
import { handoutPdfFilename, renderHandoutPdf } from '../export-handout-pdf.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { t } from '../i18n.js';
import { tccHandoutDef } from '../tcc-handout-defs.js';
import { ICON_DOWNLOAD, ICON_MORE_VERT } from '../icons.js';
import { openWorkspacePatientMenu } from '../components/workspace-patient-menu.js';
import { isTauriApp, getInvoke } from '../tauri-bridge.js';

/** Sesiones con más módulos que esto inician colapsadas en el sidebar. */
const SESSION_COLLAPSE_MODULE_THRESHOLD = 5;

/** Posición de scroll del centro a restaurar tras re-render (p. ej. borrar módulo). */
let pendingCenterScrollRestore = null;

export function moduleLabel(type) {
  return moduleLabelFor(type);
}

async function printModulePdf(mod, patientName) {
  const def = tccHandoutDef(mod.module_type);
  if (!def) return;
  const data = parseJsonSafe(mod.data, {});

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderHandoutPdf(doc, { def, data, patientName });

  const filename = handoutPdfFilename(def, patientName);

  if (isTauriApp()) {
    const bytes = doc.output('arraybuffer');
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new Uint8Array(bytes)),
    });
    toast(`Handout guardado en Documentos/Telar/exportaciones/${filename}`);
    return;
  }

  doc.save(filename);
  toast(`Handout descargado: ${filename}`);
}

export async function renderWorkspace(container, { treatmentId, sessionId, moduleId, onNavigate }) {
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
    const s = sessions.find((x) => String(x.id) === String(sessionId)) || sessions[0];
    activeSessionId = s.id;
    activeModule = s.modules[0] || null;
  }

  const patientLabel = `${escapeHtml(treatment.patient_name)}${treatment.number > 1 ? ` ${treatment.number}` : ''}`;

  container.innerHTML = `
    <div class="workspace-layout">
      <aside class="workspace-sidebar" id="leftsidebar">
        <header class="workspace-sidebar__header">
          <button type="button" class="workspace-back" data-back title="${escapeHtml(t('workspace.backAgenda'))}">←</button>
          <h1 class="workspace-patient-name">${patientLabel}</h1>
          <button type="button" class="workspace-patient-menu" id="btn-patient-menu" title="Opciones del paciente" aria-label="Opciones del paciente">${ICON_MORE_VERT}</button>
        </header>
        <div class="workspace-sidebar__scroll">
          ${sessions.map((s) => sidebarSessionHtml(s, activeModule)).join('')}
          <button type="button" class="btn btn-ghost btn-block workspace-add-session" id="btn-add-session" title="${escapeHtml(t('workspace.addSession'))}">${escapeHtml(t('workspace.addSession'))}</button>
        </div>
      </aside>

      <main class="workspace-center" id="espaciocentral">
        <div class="workspace-center__scroll" id="workspace-center-scroll">
          <div class="workspace-center__inner" id="center-modules">
            ${sessions.length ? '' : '<p class="empty-hint">Añade una sesión para comenzar.</p>'}
          </div>
        </div>
      </main>

      <aside class="workspace-tools" id="rightsidebar"></aside>
    </div>`;

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
      async onDelete(deletedId) {
        const root = container.querySelector('#workspace-center-scroll');
        pendingCenterScrollRestore = root?.scrollTop ?? 0;
        const wasActive = String(deletedId) === String(activeModule?.id);
        const remaining = sessions
          .flatMap((s) => s.modules)
          .filter((m) => String(m.id) !== String(deletedId));
        if (wasActive) {
          const next = remaining[0];
          const sess = next
            ? sessions.find((s) => s.modules.some((m) => m.id === next.id))
            : null;
          onNavigate({
            view: 'workspace',
            treatmentId,
            sessionId: sess?.id,
            moduleId: next?.id,
          });
        } else {
          await renderWorkspace(container, {
            treatmentId,
            sessionId: activeSessionId,
            moduleId: activeModule?.id,
            onNavigate,
          });
        }
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
    if (scrollToRestore != null) {
      const root = container.querySelector('#workspace-center-scroll');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (root) root.scrollTop = scrollToRestore;
          setActiveModuleHighlight(container, activeModule.id);
        });
      });
    } else {
      scrollToModule(container, activeModule.id, { force: true });
      scrollSidebarToModule(container, activeModule.id);
    }
  }
  bindModuleScrollSpy(container);

  container.querySelector('[data-back]')?.addEventListener('click', () => {
    teardownNeurofeedback();
    teardownBilateralStimulation();
    onNavigate({ view: 'agenda' });
  });

  container.querySelector('#btn-patient-menu')?.addEventListener('click', (e) => {
    openWorkspacePatientMenu(e.currentTarget, treatment, {
      onNavigate,
      onUpdated: () => toast('Estado del tratamiento actualizado'),
    });
  });

  container.querySelectorAll('.module-link').forEach((link) => {
    let didDrag = false;
    link.addEventListener('dragstart', () => {
      didDrag = true;
    });
    link.addEventListener('dragend', () => {
      setTimeout(() => {
        didDrag = false;
      }, 0);
    });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (didDrag) return;
      const mid = link.dataset.moduleId;
      onNavigate({
        view: 'workspace',
        treatmentId,
        sessionId: link.dataset.sessionId,
        moduleId: mid,
      });
      const modType = link.dataset.moduleType;
      scrollToModule(container, mid);
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
    onExportPdf: async () => {
      await exportTreatmentPdf(treatmentId);
      toast('PDF exportado en Documentos/Telar/exportaciones');
    },
  };

  bindWorkspaceModuleDnD(container, {
    treatmentId,
    activeModuleId: activeModule?.id,
    onNavigate,
  });

  bindSessionCollapse(container, activeModule);

  const notesApi = await mountNotesPanel(container.querySelector('#rightsidebar'), treatmentId, toolsOpts);
  unmountHighlight = mountTextHighlight(centerHost, {
    treatmentId,
    onNoteCreated: async () => {
      await notesApi.focusNotasTab();
    },
  });
}

function setActiveModuleHighlight(container, moduleId) {
  if (!moduleId) return;
  container.querySelectorAll('.module-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.moduleId === String(moduleId));
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
    requestAnimationFrame(() => requestAnimationFrame(run));
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
      const handout = tccHandoutDef(mod.module_type);
      const isActive = activeModule && String(mod.id) === String(activeModule.id);
      const wrap = document.createElement('article');
      wrap.className = `center-module-card${isActive ? ' center-module-card--active' : ''}`;
      wrap.id = `module-${mod.id}`;
      wrap.dataset.moduleId = mod.id;
      wrap.dataset.sessionId = session.id;
      wrap.dataset.moduleType = mod.module_type;
      wrap.dataset.sessionNumber = session.number;

      if (handout || deletable || mod.module_type === 'neurofeedback') {
        const actions = document.createElement('div');
        actions.className = 'module-card-actions';

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

function sidebarSessionHtml(session, activeModule) {
  const modCount = session.modules.length;
  const activeInSession =
    activeModule && session.modules.some((m) => String(m.id) === String(activeModule.id));
  const startCollapsed =
    modCount > SESSION_COLLAPSE_MODULE_THRESHOLD && !activeInSession;

  const mods = session.modules
    .map((m) => {
      const active = activeModule && String(m.id) === String(activeModule.id);
      const draggable =
        m.module_type !== 'registro_inicial' &&
        m.module_type !== 'motivo_consulta' &&
        m.module_type !== 'selector_modulo';
      return `<a href="#" class="module-link${active ? ' active' : ''}" data-session-id="${session.id}" data-module-id="${m.id}" data-module-type="${escapeHtml(m.module_type)}" data-draggable="${draggable ? 'true' : 'false'}" title="${escapeHtml(moduleLabel(m.module_type))}">${escapeHtml(moduleLabel(m.module_type))}</a>`;
    })
    .join('');

  return `
    <section class="session-block${startCollapsed ? ' session-block--collapsed' : ''}" data-session-id="${session.id}">
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

function bindSessionCollapse(container, activeModule) {
  container.querySelectorAll('[data-session-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.session-block');
      if (!block) return;
      const collapsed = block.classList.toggle('session-block--collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  });

  if (activeModule) {
    const link = container.querySelector(`.module-link[data-module-id="${activeModule.id}"]`);
    const block = link?.closest('.session-block');
    if (block?.classList.contains('session-block--collapsed')) {
      block.classList.remove('session-block--collapsed');
      block.querySelector('[data-session-toggle]')?.setAttribute('aria-expanded', 'true');
    }
  }
}
