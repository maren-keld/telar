import { ollamaModelFromLocalId } from './ai-config.js';
import { getInvoke, isTauriApp, openExternalUrl } from './tauri-bridge.js';

const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';

export function formatOllamaPullStatus(payload = {}) {
  const { status, percent, completed, total } = payload;
  if (status === 'success') return 'Descarga completa';
  if (status === 'pulling manifest') return 'Preparando descarga…';
  if (status === 'verifying sha256') return 'Verificando integridad…';
  if (status === 'writing manifest') return 'Finalizando…';
  if (typeof percent === 'number') return `Descargando… ${percent}%`;
  if (completed != null && total != null && total > 0) {
    const pct = Math.min(100, Math.round((completed / total) * 100));
    return `Descargando… ${pct}%`;
  }
  if (status) return status;
  return 'Descargando modelo…';
}

async function listenOllamaPullProgress(onProgress) {
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  const unlisten = await listen('ollama-pull-progress', (event) => {
    onProgress?.(event.payload || {});
  });
  return unlisten;
}

/**
 * Ollama lista los modelos con tag (`mistral:latest`), pero el id configurado
 * puede venir sin él (`mistral`).
 */
export function isModelPresent(models = [], wanted = '') {
  const target = String(wanted).trim();
  if (!target) return false;
  return models.some((name) => name === target || name.startsWith(`${target}:`));
}

/** @returns {Promise<{ running: boolean, models: string[] }>} */
export async function getOllamaStatus() {
  if (!isTauriApp()) {
    return { running: false, models: [] };
  }
  return getInvoke()('ollama_status');
}

/**
 * Falla con un mensaje accionable si Ollama no está listo, en vez de dejar que
 * la petición muera por timeout.
 */
export async function assertOllamaModelReady(model) {
  const { running, models } = await getOllamaStatus();
  if (!running) {
    throw new Error(
      'Ollama no está corriendo. Ábrelo (o pulsa «Descargar / actualizar modelo» en Ajustes → Asistente IA, que lo arranca) y vuelve a consultar.',
    );
  }
  if (!isModelPresent(models, model)) {
    const available = models.length ? ` Disponibles: ${models.join(', ')}.` : '';
    throw new Error(
      `El modelo «${model}» no está descargado en Ollama. Ve a Ajustes → Asistente IA → Descargar / actualizar modelo.${available}`,
    );
  }
}

/**
 * Descarga (ollama pull) el modelo mapeado desde un id local de Telar.
 * @param {string} localModelId
 * @param {{ onProgress?: (payload: object) => void }} [opts]
 */
export async function pullLocalModel(localModelId, { onProgress } = {}) {
  if (!isTauriApp()) {
    throw new Error('Descarga de modelos disponible en la app de escritorio');
  }
  const ollamaModel = ollamaModelFromLocalId(localModelId);
  const unlisten = await listenOllamaPullProgress(onProgress);
  try {
    return await getInvoke()('ollama_pull_model', { model: ollamaModel });
  } finally {
    if (typeof unlisten === 'function') await unlisten();
  }
}

export async function openOllamaDownloadPage() {
  await openExternalUrl(OLLAMA_DOWNLOAD_URL);
}
