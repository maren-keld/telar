import { resolveAiConfig } from './ai-config.js';
import { requireAiApiConsent } from './ai-consent.js';
import { openAiContextPreviewModal } from './components/ai-context-preview-modal.js';
import { loadProfile } from './profile.js';

/**
 * Valida consentimiento y muestra previsualización antes de enviar contexto clínico por API.
 * @returns {Promise<{ profile: object, cfg: object }>}
 */
export async function confirmClinicalAiSend({ contextText, purpose }) {
  const profile = loadProfile();
  const cfg = resolveAiConfig(profile);

  if (!cfg.enabled) {
    throw new Error('Asistente IA desactivado. Actívalo en Ajustes → Proveedor de IA.');
  }
  if (cfg.mode === 'api') {
    requireAiApiConsent(profile);
    if (!profile.aiPreviewSkip) {
      const ok = await openAiContextPreviewModal({ contextText, purpose });
      if (!ok) {
        throw new Error('Envío cancelado');
      }
    }
  }

  return { profile, cfg };
}
