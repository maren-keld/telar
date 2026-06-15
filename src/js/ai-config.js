/** Preferencias de asistente IA (AI-1). Modelo local se descarga aparte, no va en el .app. */

export const AI_MODES = {
  api: {
    id: 'api',
    label: 'API externa (recomendado)',
    description:
      'Proveedor compatible OpenAI. Por defecto Mistral (UE, GDPR). Solo se envía el contexto que autorices.',
  },
  local: {
    id: 'local',
    label: 'IA local privada',
    description:
      'Ollama sidecar en Telar. El modelo se descarga aparte a Application Support (~2–5 GB). Los datos no salen del dispositivo.',
  },
  off: {
    id: 'off',
    label: 'Desactivado',
    description: 'Sin asistente IA en el consultorio.',
  },
};

/** Orden en UI: API primero (privacy-first externo). */
export const AI_MODE_ORDER = ['api', 'local', 'off'];

/** Presets API — OpenAI-compatible. Mistral EU como default privacy-focused. */
export const AI_API_PRESETS = {
  mistral: {
    id: 'mistral',
    label: 'Mistral AI (UE — privacidad)',
    description: 'Empresa europea (Francia), GDPR. Buen equilibrio calidad/privacidad en nube.',
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
  aiMode: 'api',
  aiLocalModel: 'qwen2.5-3b-instruct-q4',
  aiApiProvider: 'mistral',
  aiApiBase: 'https://api.mistral.ai/v1',
  aiApiModel: 'mistral-small-latest',
  aiApiKey: '',
};

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
    return {
      enabled: true,
      mode: 'local',
      model: profile.aiLocalModel || AI_DEFAULTS.aiLocalModel,
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
