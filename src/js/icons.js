/** SVG inline (misma familia que el navigation drawer: stroke, nav-icon-svg). */

export const ICON_FINGERPRINT = `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 11c1.5 0 2.5-1 2.5-2.5S13.5 6 12 6s-2.5 1-2.5 2.5"/><path d="M8 11v1.2c0 2.2 1.8 4 4 4s4-1.8 4-4V11"/><path d="M6 12.5v.5c0 3.3 2.7 6 6 6"/><path d="M18 12.5v.5c0 3.3-2.7 6-6 6"/><path d="M12 18v2"/><path d="M9 20h6"/></svg>`;

export const ICON_LOCK = `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/></svg>`;

export const ICON_VOLUME_OFF = `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

export const ICON_VOLUME_ON = `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>`;

const svg = (paths) =>
  `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICON_BATTERY = svg(
  '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><rect x="4" y="9" width="10" height="6" rx="1" fill="currentColor" stroke="none"/>',
);

export const ICON_PALETTE = svg(
  '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.25" fill="currentColor" stroke="none"/><circle cx="10" cy="15" r="1.25" fill="currentColor" stroke="none"/>',
);
export const ICON_COPY = svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>');
export const ICON_DOWNLOAD = svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
export const ICON_MORE_VERT = svg('<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/>');
export const ICON_SEARCH = svg('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>');
export const ICON_CLOSE = svg('<path d="M18 6L6 18M6 6l12 12"/>');
export const ICON_PRO = svg('<path d="M12 2l2.4 4.8 5.4.8-3.9 3.8.9 5.3L12 14.9l-4.8 2.5.9-5.3L4.2 7.6l5.4-.8L12 2z"/>');

/** Iconos Ajustes — misma familia que app-sidebar */
export const ICON_SWAP = svg('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>');

export const SETTINGS_ICONS = {
  name: svg('<circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0112 0v1"/>'),
  email: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  phone: svg('<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>'),
  address: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/>'),
  locale: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z"/>'),
  darkMode: svg('<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'),
  presentation: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  lock: ICON_LOCK,
  touchId: ICON_FINGERPRINT,
  ai: svg('<path d="M12 2l1.2 3.6L17 7l-3.8 1.2L12 12l-1.2-3.8L7 7l3.8-1.2L12 2z"/>'),
  usagePing: svg('<path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/>'),
  backup: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'),
  export: svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  wipe: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  update: svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
};
