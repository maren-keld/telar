import { loadPacks } from './pack-loader.js';
import { renderAgenda } from './views/agenda.js';
import { renderTreatments } from './views/treatments.js';
import { renderNewPatient } from './views/new-patient.js';
import { renderReportes } from './views/reportes.js';
import { renderSettings } from './views/settings.js';
import { renderModulesLibrary } from './views/modules-library.js';
import { renderModuleEditor } from './views/module-editor.js';
import { renderUnlock } from './views/unlock.js';
import { renderWorkspace } from './views/workspace.js';
import { openTreatmentWorkspace } from './navigate.js';
import { initThemeFromProfile } from './profile.js';
import { ensureCustomModulesLoaded } from './custom-modules.js';
import { initLocaleFromProfile } from './i18n.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { teardownNeurofeedback } from './modules/neurofeedback.js';
import { teardownBilateralStimulation, teardownInteractiveHtml } from './modules/index.js';
import { initAppUpdateChecker } from './app-updates.js';
import { maybeSendUsagePing } from './usage-ping.js';
import { maybeSyncProFromServer, initSubscriptionCheckoutWatcher, clearStaleLocalSubscriptionApiCache } from './subscription.js';
import { openPractitionerOnboardingModal, needsPractitionerOnboarding } from './components/practitioner-onboarding.js';
import { scheduleAutoCloudBackup } from './cloud-backup.js';
import { flushPendingAutoSaves } from './autobind.js';
import { toast } from './utils.js';
import { notifySaveError } from './save-status.js';
import { initMotion } from './transitions.js';
import { ensureGlobalShareSync } from './share-sync.js';

const app = document.getElementById('app');
let lastRenderedView = '';
let lastWorkspaceHash = '';

function parseRoute() {
  const hash = location.hash.slice(1) || '/treatments';
  const [path, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  const parts = path.split('/').filter(Boolean);
  return { parts, params };
}

function navigate(patch) {
  const { parts, params } = parseRoute();
  const view = patch.view || parts[0] || 'treatments';
  const next = new URLSearchParams();
  const q = patch.search !== undefined ? patch.search : params.q;
  const t = patch.treatmentId !== undefined ? patch.treatmentId : params.t;
  const s = patch.sessionId !== undefined ? patch.sessionId : params.s;
  const m = patch.moduleId !== undefined ? patch.moduleId : params.m;
  const cm = patch.customModuleId !== undefined ? patch.customModuleId : params.cm;
  const rv = patch.returnView !== undefined ? patch.returnView : params.rv;
  const tab = patch.tab !== undefined ? patch.tab : params.tab;
  const d = patch.date !== undefined ? patch.date : params.d;
  const billingFilter = patch.billingFilter !== undefined ? patch.billingFilter : params.bf;
  if (q) next.set('q', q);
  if (t) next.set('t', t);
  if (s) next.set('s', s);
  if (m) next.set('m', m);
  if (cm) next.set('cm', cm);
  if (rv) next.set('rv', rv);
  if (tab) next.set('tab', tab);
  if (d) next.set('d', d);
  if (billingFilter) next.set('bf', billingFilter);
  const qs = next.toString();
  location.hash = `/${view}${qs ? `?${qs}` : ''}`;
}

async function render() {
  const { parts, params } = parseRoute();
  let view = parts[0] || 'treatments';
  // Redirigir búsqueda heredada de la antigua vista agenda → treatments
  if (view === 'agenda' && params.q) {
    location.hash = `/treatments?${new URLSearchParams({ q: params.q }).toString()}`;
    return;
  }

  const onNavigate = navigate;
  const previousView = lastRenderedView;
  const leavingWorkspace = previousView === 'workspace' && view !== 'workspace';

  if (leavingWorkspace) {
    try {
      await flushPendingAutoSaves();
    } catch {
      notifySaveError();
      if (lastWorkspaceHash && location.hash !== lastWorkspaceHash) {
        location.hash = lastWorkspaceHash;
      }
      return;
    }
    teardownNeurofeedback();
    teardownBilateralStimulation();
    teardownInteractiveHtml('all');
    delete app.dataset.workspaceTreatmentId;
    delete app.dataset.workspaceModuleId;
    delete app.dataset.workspaceIndexMode;
    delete app.dataset.workspaceIndexType;
    app._unmountCenterScrollSpy?.();
    app._workspaceData = null;
  }

  lastRenderedView = view;

  app.className =
    view === 'unlock' ? 'app-shell app-shell--unlock' : view === 'module-editor' ? 'app-shell app-shell--editor' : 'app-shell';

  try {
    // Gate: DB debe estar desbloqueada para todo excepto unlock.
    if (isTauriApp() && view !== 'unlock') {
      if (!window.__telarDbUnlocked) {
        const invoke = getInvoke();
        window.__telarStage = `render:db_status(${view})`;
        const st = await invoke('db_status');
        if (!st.unlocked) {
          location.hash = '/unlock';
          await renderUnlock(app, { onNavigate });
          return;
        }
        window.__telarDbUnlocked = true;
      }
      window.__telarStage = `render:custom_modules(${view})`;
      await ensureCustomModulesLoaded();
    } else if (view === 'unlock') {
      window.__telarDbUnlocked = false;
    }
    window.__telarStage = `render:view(${view})`;

    if (view !== 'unlock' && view !== 'settings' && window.__telarPacksReady) {
      window.__telarStage = `render:await_packs(${view})`;
      await window.__telarPacksReady;
    }

    switch (view) {
      case 'agenda':
        await renderAgenda(app, {
          tab: params.tab || '',
          date: params.d || '',
          sessionId: params.s || '',
          onNavigate,
        });
        break;
      case 'treatments':
        await renderTreatments(app, { search: params.q || '', onNavigate });
        break;
      case 'treatment':
        if (params.t) await openTreatmentWorkspace(params.t, onNavigate);
        else location.hash = '/treatments';
        break;
      case 'workspace':
        await renderWorkspace(app, {
          treatmentId: params.t,
          sessionId: params.s,
          moduleId: params.m,
          onNavigate,
        });
        break;
      case 'reportes':
        await renderReportes(app, {
          treatmentId: params.t,
          date: params.d || '',
          billingFilter: params.bf || 'todos',
          onNavigate,
        });
        break;
      case 'new-patient':
        renderNewPatient(app, { onNavigate });
        break;
      case 'modules':
        await renderModulesLibrary(app, { onNavigate });
        break;
      case 'module-editor':
        await renderModuleEditor(app, {
          customModuleId: params.cm || '',
          returnView: params.rv || 'modules',
          treatmentId: params.t,
          sessionId: params.s,
          moduleId: params.m,
          onNavigate,
        });
        break;
      case 'goals':
        location.hash = '/reportes';
        return;
      case 'settings':
        app.querySelector('[data-nav="settings"]')?.classList.add('is-loading');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await renderSettings(app, { onNavigate });
        break;
      case 'unlock':
        await renderUnlock(app, { onNavigate });
        break;
      default:
        location.hash = '/treatments';
    }

    if (view !== 'unlock' && needsPractitionerOnboarding()) {
      openPractitionerOnboardingModal();
    }

    if (view !== 'unlock') {
      if (!window.__telarBackupScheduled) {
        window.__telarBackupScheduled = true;
        scheduleAutoCloudBackup();
      }
      ensureGlobalShareSync();
    } else {
      window.__telarBackupScheduled = false;
    }
    if (view === 'workspace') lastWorkspaceHash = location.hash;
  } catch (err) {
    console.error(err);
    if (app.querySelector('#workspace-layout')) {
      notifySaveError();
      lastRenderedView = 'workspace';
      return;
    }
    app.innerHTML = `
      <div class="app-content">
        <h1>Telar</h1>
        <p>${err.message}</p>
        <p style="color:var(--text-secondary)">Usa <code>dist/Telar.app</code> o <code>./scripts/dev.sh</code>.</p>
      </div>`;
    toast(err.message);
  }
}

// Auto-resize textareas on input
document.addEventListener('input', (e) => {
  const ta = e.target;
  if (ta.tagName !== 'TEXTAREA') return;
  if (ta.hasAttribute('data-no-autoresize')) return;
  ta.style.height = '0';
  ta.style.height = ta.scrollHeight + 'px';
});

// Auto-resize textareas when added to DOM (un frame, no layout por cada nodo).
let pendingTextareas = [];
let textareaResizeRaf = 0;
function queueTextareaResize(ta) {
  pendingTextareas.push(ta);
  if (textareaResizeRaf) return;
  textareaResizeRaf = requestAnimationFrame(() => {
    textareaResizeRaf = 0;
    const list = pendingTextareas;
    pendingTextareas = [];
    for (const el of list) {
      if (!el.isConnected || el.tagName !== 'TEXTAREA') continue;
      if (el.hasAttribute('data-no-autoresize')) continue;
      el.style.height = '0';
      el.style.height = `${el.scrollHeight}px`;
    }
  });
}
new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'TEXTAREA') queueTextareaResize(node);
      else if (node.querySelectorAll) {
        node.querySelectorAll('textarea').forEach(queueTextareaResize);
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', async () => {
  const stage = (s) => {
    window.__telarStage = s;
  };
  const safe = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`[init:${label}]`, err);
    }
  };

  stage('init:theme');
  safe('theme', initThemeFromProfile);
  stage('init:motion');
  safe('motion', initMotion);
  stage('init:locale');
  safe('locale', initLocaleFromProfile);
  stage('init:updates');
  safe('updates', initAppUpdateChecker);
  if (isTauriApp()) {
    stage('init:usagePing');
    safe('usagePing', maybeSendUsagePing);
    stage('init:subscriptionSync');
    clearStaleLocalSubscriptionApiCache();
    safe('subscriptionWatcher', initSubscriptionCheckoutWatcher);
    maybeSyncProFromServer().catch((err) => console.debug('[subscription-sync]', err?.message || err));
  }

  // Packs en segundo plano — no bloquear PIN / unlock (Windows first boot puede tardar).
  stage('init:packs');
  const packsReady = loadPacks().catch((err) => {
    console.warn('[packs] load failed, using legacy fallback:', err?.message || err);
  });
  window.__telarPacksReady = packsReady;

  if (!location.hash) {
    if (isTauriApp()) {
      try {
        stage('db_status(boot)');
        const st = await getInvoke()('db_status');
        location.hash = st.unlocked ? '/treatments' : '/unlock';
      } catch {
        location.hash = '/unlock';
      }
    } else {
      location.hash = '/treatments';
    }
  }

  try {
    stage('render');
    await render();
  } finally {
    window.__telarBooted = true;
  }
});
