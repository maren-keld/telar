import { AI_DEFAULTS } from './ai-config.js';

const STORAGE_KEY = 'telar.practitioner';
const DEFAULTS_MIGRATION_KEY = 'telar.defaults.dark-gender.v1';
const AI_MISTRAL_DEFAULT_KEY = 'telar.defaults.ai-mistral-cloud.v1';

const DEFAULTS = {
  name: '',
  email: '',
  phone: '',
  address: '',
  /** 'm' | 'f' | '' — género gramatical para que la IA firme emails correctamente. */
  grammaticalGender: 'f',
  darkMode: true,
  useTouchId: false,
  presentationMode: false,
  usagePingOptOut: false,
  locale: 'es',
  plan: 'free',
  /** Aviso nativo cuando responden un test o handout por enlace. */
  notifyShareDesktop: true,
  /** Correo al email de Ajustes cuando responden un test o handout por enlace. */
  notifyShareEmail: false,
  /** true = no mostrar la previsualización del contexto antes de cada consulta API. */
  aiPreviewSkip: false,
  customModules: [],
  customTags: [],
  hiddenDxProblems: [],
  cloudBackupDestDir: '',
  cloudBackupEnabled: false,
  cloudBackupLastError: '',
  cloudBackupLastSuccessAt: '',
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

export function getHiddenDxProblemNames() {
  const list = loadProfile().hiddenDxProblems;
  return Array.isArray(list) ? list : [];
}

export function hideDxProblemName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  const hidden = new Set([...getHiddenDxProblemNames(), trimmed]);
  saveProfile({ hiddenDxProblems: [...hidden] });
}

export function initThemeFromProfile() {
  migrateInterfaceDefaults();
  migrateAiMistralDefault();
  const profile = loadProfile();
  applyTheme(profile.darkMode);
  applyPresentationMode(Boolean(profile.presentationMode));
}

/** Una vez: quien nunca prendió IA pasa a Mistral (nube). Local o API ya elegidos no se tocan. */
export function migrateAiMistralDefault() {
  try {
    if (localStorage.getItem(AI_MISTRAL_DEFAULT_KEY)) return;
    localStorage.setItem(AI_MISTRAL_DEFAULT_KEY, '1');
    const p = loadProfile();
    if (p.aiMode === 'off' && !p.aiApiConsentAt) {
      saveProfile({
        aiMode: 'api',
        aiApiProvider: p.aiApiProvider || AI_DEFAULTS.aiApiProvider,
        aiApiBase: p.aiApiBase || AI_DEFAULTS.aiApiBase,
        aiApiModel: p.aiApiModel || AI_DEFAULTS.aiApiModel,
      });
    }
  } catch {
    /* ignore */
  }
}

/** Una sola vez: el producto pasa a oscuro y género femenino si no estaban definidos. */
export function migrateInterfaceDefaults() {
  try {
    if (localStorage.getItem(DEFAULTS_MIGRATION_KEY)) return;
    localStorage.setItem(DEFAULTS_MIGRATION_KEY, '1');
    const p = loadProfile();
    const patch = {};
    if (p.darkMode !== true) patch.darkMode = true;
    if (!p.grammaticalGender) patch.grammaticalGender = 'f';
    if (Object.keys(patch).length) saveProfile(patch);
  } catch {
    /* ignore */
  }
}

/** Borra datos del profesional y módulos custom; conserva preferencias de interfaz y Touch ID. */
export function wipeProfileData() {
  const {
    darkMode,
    useTouchId,
    locale,
    aiMode,
    aiLocalModel,
    aiApiProvider,
    aiApiBase,
    aiApiModel,
    aiApiKey,
    aiApiConsentAt,
    notifyShareDesktop,
    notifyShareEmail,
  } = loadProfile();
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
      aiApiConsentAt: aiApiConsentAt || '',
      notifyShareDesktop: notifyShareDesktop !== false,
      notifyShareEmail: Boolean(notifyShareEmail),
    }),
  );
}
