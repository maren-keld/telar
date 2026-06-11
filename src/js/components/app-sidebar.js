const ICONS = {
  agenda: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  reportes: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>`,
  supervision: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`,
  modules: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  goals: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  help: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17h.01"/></svg>`,
};

const NAV = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'reportes', label: 'Estadísticas' },
  { id: 'goals', label: 'Objetivos' },
  { id: 'modules', label: 'Módulos' },
  { id: 'settings', label: 'Ajustes' },
  { id: 'help', label: 'Ayuda', disabled: true },
];

export function renderAppSidebar(activeNav = 'agenda') {
  const items = NAV.map((item) => {
    const active = item.id === activeNav ? ' active' : '';
    const disabled = item.disabled ? ' disabled' : '';
    const dataNav = item.disabled ? '' : ` data-nav="${item.id}"`;
    const icon = ICONS[item.id] || '';
    return `
      <button type="button" class="nav-item${active}${disabled}"${dataNav} title="${item.label}">
        <span class="nav-icon">${icon}</span>
        ${item.label}
      </button>`;
  }).join('');

  return `<nav class="sidebar">${items}</nav>`;
}

export function bindAppSidebar(container, { onNavigate }) {
  const clearCtx = { treatmentId: '', sessionId: '', moduleId: '' };
  container.querySelector('[data-nav="agenda"]')?.addEventListener('click', () => {
    onNavigate({ view: 'agenda', ...clearCtx });
  });
  container.querySelector('[data-nav="reportes"]')?.addEventListener('click', () => {
    onNavigate({ view: 'reportes', ...clearCtx });
  });
  container.querySelector('[data-nav="goals"]')?.addEventListener('click', () => {
    onNavigate({ view: 'goals', ...clearCtx });
  });
  container.querySelector('[data-nav="modules"]')?.addEventListener('click', () => {
    onNavigate({ view: 'modules', ...clearCtx });
  });
  container.querySelector('[data-nav="settings"]')?.addEventListener('click', () => {
    onNavigate({ view: 'settings', ...clearCtx });
  });
}
