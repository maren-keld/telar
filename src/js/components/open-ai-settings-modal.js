import {
  AI_API_PRESETS,
  AI_DEFAULTS,
  AI_LOCAL_MODELS,
  AI_MODE_ORDER,
  AI_MODES,
  getApiPreset,
} from '../ai-config.js';
import { getApiTransferNotice, hasAiApiConsent } from '../ai-consent.js';
import { testAiConnection } from '../ai-client.js';
import {
  formatOllamaPullStatus,
  openOllamaDownloadPage,
  pullLocalModel,
} from '../ollama-client.js';
import { loadProfile, saveProfile } from '../profile.js';
import { isTauriApp } from '../tauri-bridge.js';
import { escapeHtml, formatDate, toast } from '../utils.js';

function panelVisibility(mode) {
  return {
    local: mode === 'local' ? '' : 'hidden',
    api: mode === 'api' ? '' : 'hidden',
  };
}

function apiConsentBlockHtml(profile, providerId) {
  const notice = getApiTransferNotice({ ...profile, aiApiProvider: providerId });
  const accepted = hasAiApiConsent(profile);
  const acceptedLine = accepted
    ? `<p class="ai-consent-notice__accepted">Consentimiento registrado el ${escapeHtml(formatDate(profile.aiApiConsentAt))}.</p>`
    : '';

  return `
    <div class="ai-consent-notice" id="ai-api-consent-notice">
      <p class="ai-consent-notice__title">Transferencia internacional de datos sensibles</p>
      <p>Al usar <strong>API externa</strong>, Telar envía contexto clínico desde tu equipo hacia un tercero. Telar no almacena esos envíos.</p>
      <p><strong>Proveedor:</strong> ${escapeHtml(notice.provider)} · <strong>Servidores:</strong> ${escapeHtml(notice.serverCountry)}</p>
      <p><strong>Datos que pueden enviarse:</strong></p>
      <ul class="ai-consent-notice__list">
        ${notice.dataSent.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <p class="ai-consent-notice__legal">${escapeHtml(notice.legalNote)}</p>
      ${acceptedLine}
      <label class="ai-consent-notice__check" id="ai-api-consent-label" ${accepted ? 'hidden' : ''}>
        <input type="checkbox" id="ai-api-consent" name="aiApiConsent" />
        <span>He leído este aviso y asumo la responsabilidad del tratamiento de datos sensibles de mis pacientes al usar una API externa.</span>
      </label>
    </div>`;
}

function presetOptionsHtml(selectedId) {
  return Object.values(AI_API_PRESETS)
    .map((p) => {
      const rec =
        p.recommended && p.id !== 'custom'
          ? ' · recomendado privacidad'
          : '';
      return `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${escapeHtml(p.label)}${rec}</option>`;
    })
    .join('');
}

function modelOptionsHtml(preset, selectedModel) {
  const models =
    preset.models?.length > 0
      ? preset.models
      : selectedModel
        ? [selectedModel]
        : [];
  if (models.length === 0) {
    return `<option value="">—</option>`;
  }
  return models
    .map(
      (id) =>
        `<option value="${escapeHtml(id)}" ${selectedModel === id ? 'selected' : ''}>${escapeHtml(id)}</option>`,
    )
    .join('');
}

/** Modal Ajustes → Asistente IA (modo, presets API, modelo local). */
export function openAiSettingsModal({ onSaved } = {}) {
  const profile = loadProfile();
  const mode = profile.aiMode || AI_DEFAULTS.aiMode;
  const providerId = profile.aiApiProvider || AI_DEFAULTS.aiApiProvider;
  const preset = getApiPreset(providerId);
  const apiBase = profile.aiApiBase || preset.baseUrl || AI_DEFAULTS.aiApiBase;
  const apiModel = profile.aiApiModel || preset.defaultModel || AI_DEFAULTS.aiApiModel;
  const vis = panelVisibility(mode);
  const isCustom = providerId === 'custom';

  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card settings-ai-modal" role="dialog" aria-labelledby="ai-settings-title">
        <h2 id="ai-settings-title" class="modal-card__title">Asistente IA</h2>
        <p class="settings-ai-modal__intro">
          Por defecto la IA está <strong>desactivada</strong>. Si activas API externa, el contexto clínico sale de tu equipo
          hacia el proveedor que configures — nunca hacia Telarapp.cl. Antes de cada consulta podrás revisar el contexto exacto.
        </p>
        <form id="ai-settings-form" class="settings-ai-form">
          <fieldset class="settings-ai-modes">
            <legend class="settings-ai-form__label">Modo</legend>
            ${AI_MODE_ORDER.map((id) => AI_MODES[id])
              .filter(Boolean)
              .map(
                (m) => `
              <label class="settings-ai-mode">
                <input type="radio" name="aiMode" value="${m.id}" ${mode === m.id ? 'checked' : ''} />
                <span class="settings-ai-mode__text">
                  <strong>${escapeHtml(m.label)}</strong>
                  <small>${escapeHtml(m.description)}</small>
                </span>
              </label>`,
              )
              .join('')}
          </fieldset>

          <div id="ai-panel-local" class="settings-ai-panel" ${vis.local}>
            <label class="settings-ai-form__label" for="ai-local-model">Modelo local</label>
            <select id="ai-local-model" name="aiLocalModel" class="input">
              ${AI_LOCAL_MODELS.map(
                (m) => `
                <option value="${m.id}" ${profile.aiLocalModel === m.id ? 'selected' : ''}>
                  ${escapeHtml(m.label)} — ${escapeHtml(m.sizeHint)} · ${escapeHtml(m.ramHint)}
                </option>`,
              ).join('')}
            </select>
            <p class="settings-ai-panel__hint">
              Requiere <strong>Ollama</strong> instalado en tu equipo. Telar descargará el modelo elegido
              con <code>ollama pull</code> (varios GB; puede tardar según tu conexión).
            </p>
            <button type="button" class="btn btn-secondary btn-sm" id="ai-download-model" ${mode !== 'local' ? 'disabled' : ''}>
              Descargar / actualizar modelo
            </button>
            <span id="ai-download-status" class="settings-ai-test-status" aria-live="polite"></span>
          </div>

          <div id="ai-panel-api" class="settings-ai-panel" ${vis.api}>
            ${apiConsentBlockHtml(profile, providerId)}
            <label class="settings-ai-form__label" for="ai-api-provider">Proveedor</label>
            <select id="ai-api-provider" name="aiApiProvider" class="input">
              ${presetOptionsHtml(providerId)}
            </select>
            <p id="ai-preset-desc" class="settings-ai-panel__hint">${escapeHtml(preset.description)}</p>

            <label class="settings-ai-form__label" for="ai-api-model">Modelo</label>
            <select id="ai-api-model" name="aiApiModel" class="input">
              ${modelOptionsHtml(preset, apiModel)}
            </select>

            <label class="settings-ai-form__label" for="ai-api-base">URL base de la API</label>
            <input type="url" id="ai-api-base" name="aiApiBase" class="input" autocomplete="off"
              placeholder="https://api.mistral.ai/v1"
              value="${escapeHtml(apiBase)}"
              ${isCustom ? '' : 'readonly'} />

            <label class="settings-ai-form__label" for="ai-api-key">Clave API</label>
            <input type="password" id="ai-api-key" name="aiApiKey" class="input" autocomplete="off"
              placeholder="Clave de tu proveedor"
              value="${escapeHtml(profile.aiApiKey || '')}" />
            <p id="ai-key-hint" class="settings-ai-panel__hint">${escapeHtml(preset.keyHint)}</p>

            <div class="settings-ai-panel__actions">
              <button type="button" class="btn btn-secondary btn-sm" id="ai-test-connection" ${mode !== 'api' ? 'disabled' : ''}>
                Probar conexión
              </button>
              <span id="ai-test-status" class="settings-ai-test-status" aria-live="polite"></span>
            </div>
          </div>
        </form>
        <div class="modal-card__actions">
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-save>Guardar</button>
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  const form = root.querySelector('#ai-settings-form');
  const panelLocal = root.querySelector('#ai-panel-local');
  const panelApi = root.querySelector('#ai-panel-api');
  const downloadBtn = root.querySelector('#ai-download-model');
  const downloadStatus = root.querySelector('#ai-download-status');
  const testBtn = root.querySelector('#ai-test-connection');
  const testStatus = root.querySelector('#ai-test-status');
  const providerSelect = root.querySelector('#ai-api-provider');
  const modelSelect = root.querySelector('#ai-api-model');
  const baseInput = root.querySelector('#ai-api-base');
  const keyHint = root.querySelector('#ai-key-hint');
  const presetDesc = root.querySelector('#ai-preset-desc');
  const consentNotice = root.querySelector('#ai-api-consent-notice');

  const refreshConsentNotice = (pid) => {
    if (!consentNotice) return;
    const draft = {
      ...loadProfile(),
      aiApiProvider: pid,
      aiApiBase: baseInput?.value?.trim() || getApiPreset(pid).baseUrl,
    };
    consentNotice.outerHTML = apiConsentBlockHtml(draft, pid);
    syncConsentUi();
  };

  const syncConsentUi = () => {
    const selected = form.querySelector('input[name="aiMode"]:checked')?.value || 'off';
    const accepted = hasAiApiConsent(loadProfile());
    const box = root.querySelector('#ai-api-consent');
    const label = root.querySelector('#ai-api-consent-label');
    if (label) label.hidden = accepted || selected !== 'api';
    if (box && accepted) box.checked = true;
  };

  const applyPreset = (pid, keepCustomModel = false) => {
    const p = getApiPreset(pid);
    if (presetDesc) presetDesc.textContent = p.description;
    if (keyHint) keyHint.textContent = p.keyHint;

    if (modelSelect) {
      const current = keepCustomModel ? modelSelect.value : p.defaultModel;
      modelSelect.innerHTML = modelOptionsHtml(p, current);
      if (p.models?.length && !p.models.includes(modelSelect.value)) {
        modelSelect.value = p.defaultModel;
      }
    }

    if (baseInput) {
      const custom = pid === 'custom';
      baseInput.readOnly = !custom;
      if (!custom && p.baseUrl) {
        baseInput.value = p.baseUrl;
      } else if (custom && !baseInput.value.trim()) {
        baseInput.value = '';
      }
    }
  };

  const syncPanels = () => {
    const selected = form.querySelector('input[name="aiMode"]:checked')?.value || 'off';
    panelLocal.hidden = selected !== 'local';
    panelApi.hidden = selected !== 'api';
    if (downloadBtn) downloadBtn.disabled = selected !== 'local';
    if (testBtn) testBtn.disabled = selected !== 'api';
  };

  providerSelect?.addEventListener('change', () => {
    applyPreset(providerSelect.value);
    refreshConsentNotice(providerSelect.value);
  });

  form.querySelectorAll('input[name="aiMode"]').forEach((r) => {
    r.addEventListener('change', () => {
      syncPanels();
      syncConsentUi();
    });
  });

  root.querySelector('[data-cancel]')?.addEventListener('click', close);
  root.querySelector('[data-close]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });

  downloadBtn?.addEventListener('click', async () => {
    if (!isTauriApp()) {
      toast('Descarga de modelos disponible en la app de escritorio');
      return;
    }
    const localModelId = form.querySelector('#ai-local-model')?.value;
    if (!localModelId) return;

    downloadBtn.disabled = true;
    if (downloadStatus) {
      downloadStatus.textContent = 'Conectando con Ollama…';
      downloadStatus.className = 'settings-ai-test-status settings-ai-test-status--pending';
    }

    try {
      const result = await pullLocalModel(localModelId, {
        onProgress: (payload) => {
          if (!downloadStatus) return;
          downloadStatus.textContent = formatOllamaPullStatus(payload);
        },
      });
      if (downloadStatus) {
        downloadStatus.textContent = result.alreadyPresent
          ? 'Modelo ya instalado en Ollama'
          : 'Modelo descargado correctamente';
        downloadStatus.className = 'settings-ai-test-status settings-ai-test-status--ok';
      }
      toast(
        result.alreadyPresent
          ? 'El modelo ya estaba instalado en Ollama'
          : 'Modelo descargado. Ya puedes usar la IA local.',
      );
    } catch (err) {
      const msg = err?.message || String(err);
      if (downloadStatus) {
        downloadStatus.textContent = msg.slice(0, 160);
        downloadStatus.className = 'settings-ai-test-status settings-ai-test-status--err';
      }
      toast(msg);
      if (/ollama\.com\/download|Instala Ollama/i.test(msg)) {
        await openOllamaDownloadPage();
      }
    } finally {
      downloadBtn.disabled = form.querySelector('input[name="aiMode"]:checked')?.value !== 'local';
    }
  });

  testBtn?.addEventListener('click', async () => {
    if (!isTauriApp()) {
      toast('Prueba de conexión disponible en la app de escritorio');
      return;
    }
    const fd = new FormData(form);
    const draftProfile = {
      aiMode: 'api',
      aiApiProvider: fd.get('aiApiProvider') || AI_DEFAULTS.aiApiProvider,
      aiApiBase: String(fd.get('aiApiBase') || '').trim(),
      aiApiModel: String(fd.get('aiApiModel') || '').trim(),
      aiApiKey: String(fd.get('aiApiKey') || '').trim(),
    };
    const p = getApiPreset(draftProfile.aiApiProvider);
    if (!draftProfile.aiApiBase && p.baseUrl) draftProfile.aiApiBase = p.baseUrl;
    if (!draftProfile.aiApiModel && p.defaultModel) draftProfile.aiApiModel = p.defaultModel;
    if (p.keyRequired && !draftProfile.aiApiKey) {
      toast('Indica la clave API antes de probar');
      return;
    }

    testBtn.disabled = true;
    if (testStatus) {
      testStatus.textContent = 'Probando…';
      testStatus.className = 'settings-ai-test-status settings-ai-test-status--pending';
    }
    try {
      const reply = await testAiConnection(draftProfile);
      if (testStatus) {
        testStatus.textContent = `OK — ${reply.slice(0, 80)}`;
        testStatus.className = 'settings-ai-test-status settings-ai-test-status--ok';
      }
      toast('Conexión con la API de IA correcta');
    } catch (err) {
      const msg = err?.message || String(err);
      if (testStatus) {
        testStatus.textContent = msg.slice(0, 120);
        testStatus.className = 'settings-ai-test-status settings-ai-test-status--err';
      }
      toast(msg);
    } finally {
      testBtn.disabled = form.querySelector('input[name="aiMode"]:checked')?.value !== 'api';
    }
  });

  root.querySelector('[data-save]')?.addEventListener('click', () => {
    const fd = new FormData(form);
    const aiMode = fd.get('aiMode') || 'off';
    const aiApiProvider = fd.get('aiApiProvider') || AI_DEFAULTS.aiApiProvider;
    const presetOnSave = getApiPreset(aiApiProvider);
    const patch = {
      aiMode,
      aiLocalModel: fd.get('aiLocalModel') || AI_DEFAULTS.aiLocalModel,
      aiApiProvider,
      aiApiBase: String(fd.get('aiApiBase') || presetOnSave.baseUrl || '').trim(),
      aiApiModel: String(fd.get('aiApiModel') || presetOnSave.defaultModel || '').trim(),
      aiApiKey: String(fd.get('aiApiKey') || '').trim(),
    };
    if (aiMode === 'api') {
      if (!patch.aiApiBase) {
        toast('Indica la URL base de la API o elige otro proveedor');
        return;
      }
      if (!patch.aiApiModel) {
        toast('Elige un modelo de IA');
        return;
      }
      if (presetOnSave.keyRequired && !patch.aiApiKey) {
        toast('Indica la clave API o elige Ollama local en localhost');
        return;
      }
      const profileNow = loadProfile();
      const needsConsent = !hasAiApiConsent(profileNow);
      const consentBox = root.querySelector('#ai-api-consent');
      if (needsConsent && !consentBox?.checked) {
        toast('Debes aceptar el aviso de transferencia de datos para guardar el modo API');
        consentNotice?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (needsConsent) {
        patch.aiApiConsentAt = new Date().toISOString();
      }
    } else if (aiMode === 'off' || aiMode === 'local') {
      // Conservar fecha de consentimiento por si vuelve a activar API.
    }
    saveProfile(patch);
    close();
    toast('Preferencias de IA guardadas');
    onSaved?.();
  });
}
