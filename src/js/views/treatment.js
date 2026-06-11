import { MODULE_DEFS } from '../config.js';
import { addSession, getSessions, getTreatment } from '../db.js';
import { escapeHtml } from '../utils.js';

export async function renderTreatment(container, { treatmentId, onNavigate }) {
  const treatment = await getTreatment(treatmentId);
  if (!treatment) {
    container.innerHTML = '<p>Tratamiento no encontrado.</p>';
    return;
  }
  const sessions = await getSessions(treatmentId);

  container.innerHTML = `
    <div class="workspace-layout" style="grid-template-columns: 240px 1fr;">
      <aside class="sidebar sidebar--wide">
        <div class="sidebar-brand">
          Psicoterapia LAB
          <small>Programa de tratamiento</small>
        </div>
        <button class="nav-item nav-item--row" data-back>← Agenda</button>
        <button class="nav-item nav-item--row active">Sesiones</button>
        <button class="nav-item nav-item--row" data-nav="reportes-trat">Resultados</button>
      </aside>
      <main class="workspace-center">
        <header class="page-header">
          <h1>${escapeHtml(treatment.patient_name)}</h1>
          <span class="badge">Tratamiento ${treatment.number}</span>
        </header>
        <div class="session-list">
          ${sessions
            .map(
              (s) => `
            <div class="session-row">
              <div>
                <h3>Sesión ${s.number}</h3>
                <span class="badge badge--status-${s.status}">${s.status === 'completada' ? 'Completada' : 'Programada'}</span>
              </div>
              <div>
                <button class="btn btn-ghost btn-open-session" data-session-id="${s.id}">Abrir ficha →</button>
              </div>
            </div>`,
            )
            .join('')}
        </div>
        <button class="btn btn-secondary" id="btn-add-session" style="margin-top:20px">+ Agregar sesión</button>
      </main>
    </div>`;

  container.querySelector('[data-back]')?.addEventListener('click', () => onNavigate({ view: 'agenda' }));

  container.querySelectorAll('.btn-open-session').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sessionId = btn.dataset.sessionId;
      const { getSessionModules } = await import('../db.js');
      const mods = await getSessionModules(sessionId);
      const first = mods[0];
      onNavigate({
        view: 'workspace',
        treatmentId,
        sessionId,
        moduleId: first?.id,
      });
    });
  });

  container.querySelector('#btn-add-session')?.addEventListener('click', async () => {
    const id = await addSession(treatmentId);
    onNavigate({ view: 'workspace', treatmentId, sessionId: id });
  });

  container.querySelector('[data-nav="reportes-trat"]')?.addEventListener('click', () => {
    onNavigate({ view: 'reportes', treatmentId });
  });
}

export function moduleLabel(type) {
  return MODULE_DEFS[type]?.label || type;
}
