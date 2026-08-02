/** Preferencias de asistente IA (AI-1). Modelo local se descarga aparte, no va en el .app. */
import { BUNDLED_MISTRAL_API_KEY } from './ai-secrets.js';

export const AI_MODES = {
  off: {
    id: 'off',
    label: 'Desactivado (predeterminado)',
    description: 'Sin asistente IA. Ningún dato clínico sale del equipo por IA.',
  },
  local: {
    id: 'local',
    label: 'IA local privada',
    description:
      'Ollama sidecar en Telar. El modelo se descarga aparte a Application Support (~2–5 GB). Los datos no salen del dispositivo.',
  },
  api: {
    id: 'api',
    label: 'API externa',
    description:
      'Proveedor compatible OpenAI (p. ej. Mistral, UE). Requiere consentimiento explícito: el contexto clínico sale de tu equipo.',
  },
};

/** Orden en UI: desactivado primero (privacidad por defecto). */
export const AI_MODE_ORDER = ['off', 'local', 'api'];

/** Presets API — OpenAI-compatible. Mistral EU como default privacy-focused. */
export const AI_API_PRESETS = {
  mistral: {
    id: 'mistral',
    label: 'Mistral AI (UE)',
    description: 'Empresa europea con servidores en Francia. Requiere clave API propia.',
    serverCountry: 'Francia (Unión Europea)',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'open-mistral-nemo', 'mistral-large-latest'],
    keyHint: 'Clave en console.mistral.ai',
    keyRequired: true,
    recommended: true,
  },
  ollama_app: {
    id: 'ollama_app',
    label: 'Ollama en este Mac (sin nube)',
    description:
      'Si ya tienes Ollama.app instalado. Datos 100 % locales; compatible OpenAI en localhost.',
    serverCountry: 'Este equipo (localhost)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'mistral',
    models: ['mistral', 'llama3.2', 'qwen2.5', 'gemma2'],
    keyHint: 'Sin clave necesaria',
    keyRequired: false,
  },
  custom: {
    id: 'custom',
    label: 'Personalizado',
    description: 'OpenAI, Azure, LiteLLM, OpenRouter u otro gateway privado.',
    serverCountry: 'Según el proveedor que configures',
    baseUrl: '',
    defaultModel: '',
    models: [],
    keyHint: 'Según tu proveedor',
    keyRequired: false,
  },
};

/** Modelos locales sugeridos — cuantización Q4 para Apple Silicon / 16 GB RAM. */
export const AI_LOCAL_MODELS = [
  {
    id: 'qwen2.5-3b-instruct-q4',
    label: 'Qwen 2.5 3B (ligero)',
    sizeHint: '~2 GB descarga',
    ramHint: '8 GB RAM mínimo',
  },
  {
    id: 'qwen2.5-7b-instruct-q4',
    label: 'Qwen 2.5 7B (recomendado)',
    sizeHint: '~4,5 GB descarga',
    ramHint: '16 GB RAM recomendado',
  },
  {
    id: 'llama3.2-3b-instruct-q4',
    label: 'Llama 3.2 3B',
    sizeHint: '~2 GB descarga',
    ramHint: '8 GB RAM mínimo',
  },
  {
    id: 'mistral-7b-instruct-q4',
    label: 'Mistral 7B',
    sizeHint: '~4 GB descarga',
    ramHint: '16 GB RAM recomendado',
  },
];

export const AI_DEFAULTS = {
  aiMode: 'off',
  aiLocalModel: 'qwen2.5-3b-instruct-q4',
  aiApiProvider: 'mistral',
  aiApiBase: 'https://api.mistral.ai/v1',
  aiApiModel: 'mistral-small-latest',
  aiApiKey: BUNDLED_MISTRAL_API_KEY || '',
};

/** Ollama OpenAI-compatible en el mismo equipo. */
export const OLLAMA_LOCAL_API_BASE = 'http://127.0.0.1:11434/v1';

const LOCAL_MODEL_TO_OLLAMA = {
  'qwen2.5-3b-instruct-q4': 'qwen2.5:3b',
  'qwen2.5-7b-instruct-q4': 'qwen2.5:7b',
  'llama3.2-3b-instruct-q4': 'llama3.2:3b',
  'mistral-7b-instruct-q4': 'mistral',
};

export function isLocalAiApiBase(base = '') {
  return /127\.0\.0\.1|localhost/.test(String(base));
}

export function ollamaModelFromLocalId(localModelId) {
  return LOCAL_MODEL_TO_OLLAMA[localModelId] || 'mistral';
}

export function isLocalAiEndpoint(cfg) {
  if (!cfg?.enabled) return false;
  if (cfg.mode === 'local') return true;
  return cfg.mode === 'api' && isLocalAiApiBase(cfg.apiBase);
}

export function aiModeLabel(mode) {
  return AI_MODES[mode]?.label || AI_MODES.off.label;
}

export function getApiPreset(providerId) {
  return AI_API_PRESETS[providerId] || AI_API_PRESETS.mistral;
}

/** Config resuelta para llamadas (ai-client.js). */
export function resolveAiConfig(profile = {}) {
  const mode = profile.aiMode ?? AI_DEFAULTS.aiMode;
  if (mode === 'off') {
    return { enabled: false, mode: 'off' };
  }
  if (mode === 'local') {
    const localModel = profile.aiLocalModel || AI_DEFAULTS.aiLocalModel;
    return {
      enabled: true,
      mode: 'local',
      apiBase: OLLAMA_LOCAL_API_BASE,
      model: localModel,
      apiModel: ollamaModelFromLocalId(localModel),
      apiKey: '',
      keyRequired: false,
    };
  }
  const providerId = profile.aiApiProvider || AI_DEFAULTS.aiApiProvider;
  const preset = getApiPreset(providerId);
  const apiBase = (profile.aiApiBase || preset.baseUrl || AI_DEFAULTS.aiApiBase).trim();
  const apiModel = (profile.aiApiModel || preset.defaultModel || AI_DEFAULTS.aiApiModel).trim();
  return {
    enabled: true,
    mode: 'api',
    providerId,
    providerLabel: preset.label,
    apiBase,
    apiModel,
    apiKey: profile.aiApiKey || '',
    keyRequired: preset.keyRequired !== false,
  };
}

export function aiSettingsSummary(profile) {
  const mode = profile.aiMode || AI_DEFAULTS.aiMode;
  if (mode === 'off') return 'Desactivado';
  if (mode === 'local') {
    const m = AI_LOCAL_MODELS.find((x) => x.id === profile.aiLocalModel) || AI_LOCAL_MODELS[0];
    return `Local · ${m.label}`;
  }
  const preset = getApiPreset(profile.aiApiProvider || AI_DEFAULTS.aiApiProvider);
  const model = (profile.aiApiModel || preset.defaultModel || '').trim();
  if (preset.id === 'mistral') {
    return model ? `Mistral · ${model}` : 'Mistral (UE)';
  }
  if (preset.id === 'ollama_app') {
    return model ? `Ollama local · ${model}` : 'Ollama local';
  }
  const base = (profile.aiApiBase || preset.baseUrl || '').trim();
  if (base) {
    try {
      const host = new URL(base).hostname;
      return model ? `API · ${host} · ${model}` : `API · ${host}`;
    } catch {
      return 'API externa configurada';
    }
  }
  return 'API externa (falta URL)';
}

export function isAiLocalEnabled(profile) {
  return (profile.aiMode || AI_DEFAULTS.aiMode) === 'local';
}

export function isAiApiEnabled(profile) {
  return (profile.aiMode || AI_DEFAULTS.aiMode) === 'api';
}
