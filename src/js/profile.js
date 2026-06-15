import { AI_DEFAULTS } from './ai-config.js';

const STORAGE_KEY = 'telar.practitioner';

const DEFAULTS = {
  name: '',
  email: '',
  phone: '',
  address: '',
  darkMode: false,
  useTouchId: false,
  presentationMode: false,
  usagePingOptOut: false,
  locale: 'es',
  plan: 'free',
  customModules: [],
  ...AI_DEFAULTS,
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

/** Borra datos del profesional y módulos custom; conserva preferencias de interfaz y Touch ID. */
export function wipeProfileData() {
  const { darkMode, useTouchId, locale, aiMode, aiLocalModel, aiApiProvider, aiApiBase, aiApiModel, aiApiKey } =
    loadProfile();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...DEFAULTS,
      darkMode,
      useTouchId,
      locale: locale || 'es',
      aiMode: aiMode || AI_DEFAULTS.aiMode,
      aiLocalModel: aiLocalModel || AI_DEFAULTS.aiLocalModel,
      aiApiProvider: aiApiProvider || AI_DEFAULTS.aiApiProvider,
      aiApiBase: aiApiBase || AI_DEFAULTS.aiApiBase,
      aiApiModel: aiApiModel || AI_DEFAULTS.aiApiModel,
      aiApiKey: aiApiKey || '',
    }),
  );
}
