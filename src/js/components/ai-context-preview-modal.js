import { getApiTransferNotice } from '../ai-consent.js';
import { loadProfile, saveProfile } from '../profile.js';
import { escapeHtml } from '../utils.js';

/**
 * Muestra el contexto clínico que se enviará a la IA y pide confirmación explícita.
 *
 * Si el usuario marca «no volver a preguntar», queda registrado en el perfil y
 * las siguientes consultas se envían directo (se puede revertir en Ajustes).
 * @returns {Promise<boolean>}
 */
export function openAiContextPreviewModal({ contextText, purpose = 'Consulta al asistente' } = {}) {
  const profile = loadProfile();
  const notice = getApiTransferNotice(profile);
  const preview = String(contextText || '').trim();
  const charCount = preview.length;

  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal-card ai-preview-modal" role="dialog" aria-labelledby="ai-preview-title">
          <h2 id="ai-preview-title" class="modal-card__title">Revisar envío a IA externa</h2>
          <p class="ai-preview-modal__purpose">${escapeHtml(purpose)}</p>

          <div class="ai-preview-modal__cols">
            <div class="ai-preview-modal__side">
              <div class="ai-consent-notice ai-consent-notice--inline">
                <p><strong>Destino:</strong> ${escapeHtml(notice.provider)} · servidores en ${escapeHtml(notice.serverCountry)}</p>
                <p><strong>Qué se envía:</strong></p>
                <ul class="ai-consent-notice__list">
                  ${notice.dataSent.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                </ul>
                <p class="ai-consent-notice__legal">${escapeHtml(notice.legalNote)}</p>
              </div>
              <label class="ai-preview-modal__skip">
                <input type="checkbox" id="ai-preview-skip" />
                <span>No volver a preguntar antes de cada consulta</span>
              </label>
            </div>

            <div class="ai-preview-modal__main">
              <label class="settings-ai-form__label" for="ai-preview-text">Contexto exacto (${charCount.toLocaleString('es-CL')} caracteres)</label>
              <textarea id="ai-preview-text" class="input ai-preview-modal__textarea" readonly spellcheck="false">${escapeHtml(preview)}</textarea>
            </div>
          </div>

          <div class="modal-card__actions">
            <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-primary" data-confirm>Enviar a la IA</button>
          </div>
        </div>
      </div>`;

    const close = (result) => {
      if (result && root.querySelector('#ai-preview-skip')?.checked) {
        saveProfile({ aiPreviewSkip: true });
      }
      root.innerHTML = '';
      resolve(result);
    };

    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    root.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
    root.querySelector('[data-close]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(false);
    });
  });
}
