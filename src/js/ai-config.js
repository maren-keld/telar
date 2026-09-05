/** Preferencias de asistente IA (AI-1). Modelo local se descarga aparte, no va en el .app. */

export const AI_MODES = {
  off: {
    id: 'off',
    label: 'Desactivado',
    description: 'Sin asistente. Ningún dato clínico sale del equipo por IA.',
  },
  api: {
    id: 'api',
    label: 'IA en la nube (recomendada)',
    description:
      'Mistral en Francia, lista para usar. La primera vez pedimos tu consentimiento: el contexto del caso sale de tu equipo. Telar no lo guarda.',
  },
  local: {
    id: 'local',
    label: 'En este computador',
    description:
      'Ollama en tu equipo (~2–5 GB). Nada sale del dispositivo. Es más lenta y suele responder peor en español clínico.',
  },
};

/** Nube primero (default). Local queda al fondo. */
export const AI_MODE_ORDER = ['api', 'off', 'local'];

/** Presets API — OpenAI-compatible. Mistral EU como default privacy-focused. */
export const AI_API_PRESETS = {
  mistral: {
    id: 'mistral',
    label: 'Mistral AI (UE)',
    description:
      'Servidores en Francia. Telar la activa la primera vez (la clave no viaja en el instalador). El caso no pasa por telarapp.cl.',
    serverCountry: 'Francia (Unión Europea)',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'open-mistral-nemo', 'mistral-large-latest'],
    keyHint: 'Clave en console.mistral.ai',
    keyRequired: true,
    recommended: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description:
      'La más capaz (notas y módulos). Usas tu cuenta de Anthropic: pegas una clave. Los datos salen a Estados Unidos.',
    serverCountry: 'Estados Unidos',
    baseUrl: 'https://api.anthropic.com/v1',
    // Protocolo distinto a OpenAI: el Rust usa /messages y x-api-key.
    protocol: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    keyHint: 'Clave en console.anthropic.com (empieza con sk-ant-)',
    keyRequired: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    description: 'GPT con tu propia clave API. Los datos que envíes salen de tu equipo.',
    serverCountry: 'Estados Unidos',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
    keyHint: 'Clave en platform.openai.com (empieza con sk-)',
    keyRequired: true,
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
    recommended: false,
    diff: 'Rápido para probar el flujo. Menos matices en programas largos.',
    caution: 'En programas largos un modelo chico (Qwen 2.5 3B) puede cortar el listado.',
  },
  {
    id: 'qwen2.5-7b-instruct-q4',
    label: 'Qwen 2.5 7B',
    sizeHint: '~4,5 GB descarga',
    ramHint: '16 GB RAM recomendado',
    caution: 'Mucho más lento, incluso en Mac M4. Mejor 3B salvo que el 3B se quede corto.',
    diff: 'Mejor equilibrio en español clínico: programas y resúmenes con más coherencia.',
  },
  {
    id: 'llama3.2-3b-instruct-q4',
    label: 'Llama 3.2 3B',
    sizeHint: '~2 GB descarga',
    ramHint: '8 GB RAM mínimo',
    diff: 'Ligero, a veces más telegráfico. Útil si el equipo va justo de RAM.',
  },
  {
    id: 'mistral-7b-instruct-q4',
    label: 'Mistral 7B',
    sizeHint: '~4 GB descarga',
    ramHint: '16 GB RAM recomendado',
    diff: 'Buen castellano general. En fichas largas puede recortar el plan.',
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

/** La clave de Mistral ya no se embebe: la entrega el servidor al activar. */
export function telarProvisionsMistral() {
  return true;
}

export function hasBundledMistralKey() {
  return telarProvisionsMistral();
}

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
    apiKey: preset.id === 'mistral' ? '' : profile.aiApiKey || '',
    keyRequired: preset.keyRequired !== false,
    keyHint: preset.keyHint || '',
    // 'anthropic' cambia de endpoint y cabeceras en Rust; vacío = OpenAI-compatible.
    apiProtocol: preset.protocol || '',
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
  if (preset.id === 'anthropic' || preset.id === 'openai') {
    return model ? `${preset.label} · ${model}` : preset.label;
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
