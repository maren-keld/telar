import { t } from '../i18n.js';

const ICONS = {
  agenda: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  treatments: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  reportes: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>`,
  supervision: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`,
  modules: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  goals: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
};

const NAV = [
  { id: 'treatments', labelKey: 'nav.treatments' },
  { id: 'agenda', labelKey: 'nav.agenda' },
  { id: 'reportes', labelKey: 'nav.reportes' },
  { id: 'goals', labelKey: 'nav.goals' },
  { id: 'modules', labelKey: 'nav.modules' },
  { id: 'settings', labelKey: 'nav.settings' },
];

const SCREEN_IDS = {
  agenda: 'nav-agenda',
  treatments: 'nav-patients',
  reportes: 'nav-statistics',
  goals: 'nav-goals',
  settings: 'nav-settings',
  modules: 'nav-modules',
};

export function renderAppSidebar(activeNav = 'treatments') {
  const items = NAV.map((item) => {
    const label = t(item.labelKey, item.id);
    const active = item.id === activeNav ? ' active' : '';
    const disabled = item.disabled ? ' disabled' : '';
    const dataNav = item.disabled ? '' : ` data-nav="${item.id}"`;
    const icon = ICONS[item.id] || '';
    const screenId = SCREEN_IDS[item.id];
    const idAttr = screenId ? ` id="${screenId}"` : '';
    return `
      <button type="button" class="nav-item${active}${disabled}"${idAttr}${dataNav} title="${label}">
        <span class="nav-icon">${icon}</span>
        ${label}
      </button>`;
  }).join('');


  return `<nav class="sidebar"><div class="sidebar-nav">${items}</div></nav>`;
}

export function bindAppSidebar(container, { onNavigate }) {
  const clearCtx = { treatmentId: '', sessionId: '', moduleId: '', search: '', tab: '', date: '', billingFilter: '' };
  container.querySelector('[data-nav="agenda"]')?.addEventListener('click', () => {
    onNavigate({ view: 'agenda', ...clearCtx });
  });
  container.querySelector('[data-nav="treatments"]')?.addEventListener('click', () => {
    onNavigate({ view: 'treatments', ...clearCtx });
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
