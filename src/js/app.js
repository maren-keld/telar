import { renderAgenda } from './views/agenda.js';
import { renderNewPatient } from './views/new-patient.js';
import { renderReportes } from './views/reportes.js';
import { renderSettings } from './views/settings.js';
import { renderModulesLibrary } from './views/modules-library.js';
import { renderGoals } from './views/goals.js';
import { renderUnlock } from './views/unlock.js';
import { renderWorkspace } from './views/workspace.js';
import { openTreatmentWorkspace } from './navigate.js';
import { initThemeFromProfile } from './profile.js';
import { initLocaleFromProfile } from './i18n.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { teardownNeurofeedback } from './modules/neurofeedback.js';
import { teardownBilateralStimulation } from './modules/index.js';
import { initAppUpdateChecker } from './app-updates.js';
import { maybeSendUsagePing } from './usage-ping.js';
import { toast } from './utils.js';

const app = document.getElementById('app');
let lastRenderedView = '';

function parseRoute() {
  const hash = location.hash.slice(1) || '/agenda';
  const [path, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  const parts = path.split('/').filter(Boolean);
  return { parts, params };
}

function navigate(patch) {
  const { parts, params } = parseRoute();
  const view = patch.view || parts[0] || 'agenda';
  const next = new URLSearchParams();
  const q = patch.search !== undefined ? patch.search : params.q;
  const t = patch.treatmentId !== undefined ? patch.treatmentId : params.t;
  const s = patch.sessionId !== undefined ? patch.sessionId : params.s;
  const m = patch.moduleId !== undefined ? patch.moduleId : params.m;
  if (q) next.set('q', q);
  if (t) next.set('t', t);
  if (s) next.set('s', s);
  if (m) next.set('m', m);
  const qs = next.toString();
  location.hash = `/${view}${qs ? `?${qs}` : ''}`;
}

async function render() {
  const { parts, params } = parseRoute();
  const view = parts[0] || 'agenda';
  const onNavigate = navigate;

  if (lastRenderedView === 'workspace' && view !== 'workspace') {
    teardownNeurofeedback();
    teardownBilateralStimulation();
  }
  lastRenderedView = view;

  app.className = view === 'unlock' ? 'app-shell app-shell--unlock' : 'app-shell';

  try {
    // Gate: DB debe estar desbloqueada para todo excepto unlock.
    if (isTauriApp() && view !== 'unlock') {
      const invoke = getInvoke();
      window.__telarStage = `render:db_status(${view})`;
      const st = await invoke('db_status');
      if (!st.unlocked) {
        location.hash = '/unlock';
        await renderUnlock(app, { onNavigate });
        return;
      }
    }
    window.__telarStage = `render:view(${view})`;

    switch (view) {
      case 'agenda':
        await renderAgenda(app, { search: params.q || '', onNavigate });
        break;
      case 'treatment':
        if (params.t) await openTreatmentWorkspace(params.t, onNavigate);
        else location.hash = '/agenda';
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
        await renderReportes(app, { treatmentId: params.t, onNavigate });
        break;
      case 'new-patient':
        renderNewPatient(app, { onNavigate });
        break;
      case 'modules':
        await renderModulesLibrary(app, { onNavigate });
        break;
      case 'goals':
        await renderGoals(app, { onNavigate });
        break;
      case 'settings':
        await renderSettings(app, { onNavigate });
        break;
      case 'unlock':
        await renderUnlock(app, { onNavigate });
        break;
      default:
        location.hash = '/agenda';
    }
  } catch (err) {
    console.error(err);
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
  ta.style.height = '0';
  ta.style.height = ta.scrollHeight + 'px';
});

// Auto-resize textareas when added to DOM
new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      const tas = node.tagName === 'TEXTAREA' ? [node] : [...node.querySelectorAll('textarea')];
      for (const ta of tas) {
        ta.style.height = '0';
        ta.style.height = ta.scrollHeight + 'px';
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
  stage('init:locale');
  safe('locale', initLocaleFromProfile);
  stage('init:updates');
  safe('updates', initAppUpdateChecker);
  if (isTauriApp()) {
    stage('init:usagePing');
    safe('usagePing', maybeSendUsagePing);
  }

  if (!location.hash) {
    if (isTauriApp()) {
      try {
        stage('db_status(boot)');
        const st = await getInvoke()('db_status');
        location.hash = st.unlocked ? '/agenda' : '/unlock';
      } catch {
        location.hash = '/unlock';
      }
    } else {
      location.hash = '/agenda';
    }
  }

  try {
    stage('render');
    await render();
  } finally {
    window.__telarBooted = true;
  }
});
