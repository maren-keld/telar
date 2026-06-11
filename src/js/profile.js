const STORAGE_KEY = 'psicoterapia-lab.practitioner';

const DEFAULTS = {
  name: '',
  email: '',
  phone: '',
  address: '',
  darkMode: false,
  useTouchId: false,
  presentationMode: false,
  plan: 'free',
  customModules: [],
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveProfile(patch) {
  const next = { ...loadProfile(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (typeof patch.darkMode === 'boolean') applyTheme(patch.darkMode);
  return next;
}

export function applyTheme(darkMode) {
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
}

export function applyPresentationMode(on) {
  document.documentElement.dataset.presentation = on ? 'on' : '';
}

export function isProUser() {
  return loadProfile().plan === 'pro';
}

export function initThemeFromProfile() {
  const profile = loadProfile();
  applyTheme(profile.darkMode);
  applyPresentationMode(Boolean(profile.presentationMode));
}
