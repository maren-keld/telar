import { t } from '../i18n.js';

const ICONS = {
  agenda: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  treatments: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  reportes: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>`,
  supervision: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`,
  modules: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  goals: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`,
};

const NAV = [
  { id: 'treatments', labelKey: 'nav.treatments' },
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
    container.querySelector('[data-nav="settings"]')?.classList.add('is-loading');
    onNavigate({ view: 'settings', ...clearCtx });
  });
}
