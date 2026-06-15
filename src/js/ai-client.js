import { resolveAiConfig } from './ai-config.js';
import { loadProfile } from './profile.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';

function extractAssistantText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}

/**
 * Chat completion OpenAI-compatible vía Rust (sin restricciones CSP).
 * @param {{ messages: Array<{role:string, content:string}>, maxTokens?: number, profile?: object }} opts
 */
export async function chatCompletion({ messages, maxTokens = 512, profile } = {}) {
  const cfg = resolveAiConfig(profile ?? loadProfile());
  if (!cfg.enabled) {
    throw new Error('Asistente IA desactivado. Actívalo en Ajustes → Proveedor de IA.');
  }
  if (cfg.mode === 'local') {
    throw new Error('IA local aún no disponible (sidecar Ollama — AI-1). Usa API externa por ahora.');
  }
  if (!cfg.apiBase) {
    throw new Error('Falta URL base de la API en Ajustes.');
  }
  if (!cfg.apiModel) {
    throw new Error('Falta modelo de IA en Ajustes.');
  }
  if (cfg.keyRequired && !cfg.apiKey?.trim()) {
    throw new Error('Falta clave API. Obtén una en console.mistral.ai o elige Ollama local.');
  }
  if (!isTauriApp()) {
    throw new Error('Las llamadas a IA requieren la app de escritorio Telar.');
  }

  const response = await getInvoke()('ai_chat_completion', {
    apiBase: cfg.apiBase,
    apiKey: cfg.apiKey || '',
    model: cfg.apiModel,
    messages,
    maxTokens,
  });

  const text = extractAssistantText(response);
  return { response, text };
}

/** Prueba conexión con un prompt mínimo. */
export async function testAiConnection(profile) {
  const { text } = await chatCompletion({
    profile,
    maxTokens: 24,
    messages: [{ role: 'user', content: 'Responde con una sola palabra: OK' }],
  });
  return text || 'Conexión OK';
}
