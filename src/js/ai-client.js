import { resolveAiConfig } from './ai-config.js';
import { ensureTelarMistralKey } from './ai-mistral-provision.js';
import { assertOllamaModelReady } from './ollama-client.js';
import { loadProfile } from './profile.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';

let nextAiRequestId = 1;

/** Token de aborto para una consulta de chat (sidebar, perfil, etc.). */
export function createAiRequest() {
  return { aborted: false, id: nextAiRequestId++ };
}

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

function isCancelError(err) {
  return /cancelado/i.test(err?.message || '');
}

/** Cierra el stream SSE en Rust; Ollama deja de generar. */
export async function cancelChatCompletion(request) {
  const id = Number(request?.id) || 0;
  if (!id || !isTauriApp()) return;
  try {
    await getInvoke()('ai_chat_cancel', { requestId: id });
  } catch {
    /* el invoke de completion devolverá cancelado igualmente */
  }
}

/**
 * Chat completion OpenAI-compatible vía Rust (sin restricciones CSP).
 * @param {{ messages: Array<{role:string, content:string}>, maxTokens?: number, profile?: object, request?: { aborted?: boolean, id?: number } }} opts
 */
export async function chatCompletion({ messages, maxTokens = 512, profile, request } = {}) {
  const resolvedProfile = profile ?? loadProfile();
  const cfg = resolveAiConfig(resolvedProfile);
  if (!cfg.enabled) {
    throw new Error('Asistente IA desactivado. Actívalo en Ajustes → Proveedor de IA.');
  }
  if (cfg.mode === 'api' && cfg.providerId === 'mistral') {
    cfg.apiKey = await ensureTelarMistralKey(resolvedProfile);
  }
  if (!cfg.apiBase) {
    throw new Error('Falta URL base de la API en Ajustes.');
  }
  if (!cfg.apiModel) {
    throw new Error('Falta modelo de IA en Ajustes.');
  }
  if (cfg.keyRequired && !cfg.apiKey?.trim()) {
    throw new Error(
      `Falta clave API para ${cfg.providerLabel || 'el proveedor'}. ${cfg.keyHint || 'Configúrala en Ajustes → Asistente IA'} o elige Ollama local.`,
    );
  }
  if (!isTauriApp()) {
    throw new Error('Las llamadas a IA requieren la app de escritorio Telar.');
  }
  if (cfg.mode === 'local') {
    await assertOllamaModelReady(cfg.apiModel);
  }

  if (request?.aborted) throw new Error('cancelado');
  try {
    const response = await getInvoke()('ai_chat_completion', {
      apiBase: cfg.apiBase,
      apiKey: cfg.apiKey || '',
      model: cfg.apiModel,
      messages,
      maxTokens,
      requestId: request?.id || 0,
      provider: cfg.apiProtocol || '',
    });
    if (request?.aborted) throw new Error('cancelado');

    const text = extractAssistantText(response);
    return { response, text };
  } catch (err) {
    if (request?.aborted || isCancelError(err)) throw new Error('cancelado');
    throw err;
  }
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
