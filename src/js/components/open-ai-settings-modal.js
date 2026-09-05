import {
  AI_API_PRESETS,
  AI_DEFAULTS,
  AI_LOCAL_MODELS,
  AI_MODE_ORDER,
  AI_MODES,
  getApiPreset,
  ollamaModelFromLocalId,
  telarProvisionsMistral,
} from '../ai-config.js';
import { ensureTelarMistralKey } from '../ai-mistral-provision.js';
import { getApiTransferNotice, hasAiApiConsent } from '../ai-consent.js';
import { testAiConnection } from '../ai-client.js';
import {
  formatOllamaPullStatus,
  getOllamaStatus,
  isModelPresent,
  openOllamaDownloadPage,
  pullLocalModel,
} from '../ollama-client.js';
import { loadProfile, saveProfile } from '../profile.js';
import { isTauriApp } from '../tauri-bridge.js';
import { escapeHtml, formatDate, toast } from '../utils.js';

const CONTACT_MAILTO = 'mailto:contacto@telarapp.cl';
const IA_HELP_MAILTO =
  CONTACT_MAILTO + '?subject=' + encodeURIComponent('Ayuda IA local de Telar (Ollama)');

function panelVisibility(mode) {
  return {
    local: mode === 'api' ? 'hidden' : '',
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
      <p class="ai-consent-notice__title">La primera vez: el caso sale de tu computador</p>
      <p>Si usas la IA en la nube, Telar envía contexto del caso a un tercero. <strong>Telar no lo guarda</strong> ni lo ve: va directo desde tu equipo.</p>
      <p><strong>Proveedor:</strong> ${escapeHtml(notice.provider)} · <strong>Servidores:</strong> ${escapeHtml(notice.serverCountry)}</p>
      <p><strong>Datos que pueden enviarse:</strong></p>
      <ul class="ai-consent-notice__list">
        ${notice.dataSent.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <p class="ai-consent-notice__legal">${escapeHtml(notice.legalNote)}</p>
      ${acceptedLine}
      <label class="ai-consent-notice__check" id="ai-api-consent-label" ${accepted ? 'hidden' : ''}>
        <input type="checkbox" id="ai-api-consent" name="aiApiConsent" />
        <span>Entiendo que el contexto del caso viaja al proveedor indicado (con Mistral: Francia) y que Telar no lo almacena. Asumo la responsabilidad sobre los datos de mis pacientes.</span>
      </label>
    </div>`;
}

function presetOptionsHtml(selectedId) {
  return Object.values(AI_API_PRESETS)
    .map((p) => {
      const rec =
        p.id === 'mistral' ? ' · incluida en Telar' : '';
      return `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${escapeHtml(p.label)}${rec}</option>`;
    })
    .join('');
}

function localModelCardsHtml(selectedId) {
  return AI_LOCAL_MODELS.map((m) => {
    const rec = m.recommended ? '<span class="settings-ai-model__rec">Recomendado</span>' : '';
    return `
      <label class="settings-ai-model" data-local-model="${escapeHtml(m.id)}" data-ollama="${escapeHtml(ollamaModelFromLocalId(m.id))}">
        <input type="radio" name="aiLocalModel" value="${escapeHtml(m.id)}" ${selectedId === m.id ? 'checked' : ''} />
        <span class="settings-ai-model__body">
          <span class="settings-ai-model__top">
            <strong>${escapeHtml(m.label)}</strong>
            ${rec}
            <span class="settings-ai-model__status" data-install-status>—</span>
          </span>
          <small>${escapeHtml(m.diff || '')} ${escapeHtml(m.sizeHint)} · ${escapeHtml(m.ramHint)}</small>
          ${m.caution ? `<span class="settings-ai-model__caution">${escapeHtml(m.caution)}</span>` : ''}
          <span class="settings-ai-model__slot" data-download-slot></span>
        </span>
      </label>`;
  }).join('');
}

function apiModelCardsHtml(preset, selectedModel) {
  const models =
    preset.models?.length > 0 ? preset.models : selectedModel ? [selectedModel] : [];
  if (!models.length) {
    return `<p class="settings-ai-panel__hint">Escribe el id del modelo abajo si usas un proveedor personalizado.</p>`;
  }
  return models
    .map(
      (id) => `
      <label class="settings-ai-model">
        <input type="radio" name="aiApiModelChoice" value="${escapeHtml(id)}" ${selectedModel === id ? 'checked' : ''} />
        <span class="settings-ai-model__body">
          <span class="settings-ai-model__top"><strong>${escapeHtml(id)}</strong></span>
        </span>
      </label>`,
    )
    .join('');
}

async function refreshLocalInstallBadges(root) {
  let models = [];
  let running = false;
  const installed = new Set();
  try {
    const status = await getOllamaStatus();
    running = Boolean(status?.running);
    models = Array.isArray(status?.models) ? status.models : [];
  } catch {
    running = false;
  }
  root.querySelectorAll('[data-local-model]').forEach((el) => {
    const badge = el.querySelector('[data-install-status]');
    const wanted = el.dataset.ollama || '';
    const ok = isModelPresent(models, wanted);
    el.classList.toggle('is-installed', ok);
    if (ok) installed.add(el.dataset.localModel);
    if (!badge) return;
    if (ok) badge.textContent = 'Instalado';
    else if (!running) badge.textContent = 'Ollama apagado';
    else badge.textContent = 'No descargado';
  });
  return { running, installed };
}

function syncDownloadButton(root, downloadRow, downloadBtn, installed, ready) {
  if (!downloadRow || !downloadBtn) return;
  const park = root.querySelector('#ai-download-park');
  const mode = root.querySelector('input[name="aiMode"]:checked')?.value;
  const selected = root.querySelector('input[name="aiLocalModel"]:checked')?.value;
  if (!ready || mode === 'api' || !selected) {
    downloadRow.hidden = true;
    park?.appendChild(downloadRow);
    return;
  }
  const card = root.querySelector(`[data-local-model="${selected}"]`);
  const slot = card?.querySelector('[data-download-slot]');
  if (!slot) {
    downloadRow.hidden = true;
    park?.appendChild(downloadRow);
    return;
  }
  const ok = installed?.has(selected);
  slot.appendChild(downloadRow);
  downloadRow.hidden = false;
  downloadBtn.hidden = false;
  downloadBtn.textContent = ok ? 'Actualizar este modelo' : 'Descargar este modelo';
  downloadBtn.disabled = false;
}

/** Modal Ajustes → Asistente IA (modo, presets API, modelo local). Reutilizable desde el dock. */
export function openAiSettingsModal({ onSaved, onCancel, source, preferredLocalModel } = {}) {
  const profile = loadProfile();
  const mode = profile.aiMode || AI_DEFAULTS.aiMode;
  const providerId = profile.aiApiProvider || AI_DEFAULTS.aiApiProvider;
  const preset = getApiPreset(providerId);
  const apiBase = profile.aiApiBase || preset.baseUrl || AI_DEFAULTS.aiApiBase;
  const apiModel = profile.aiApiModel || preset.defaultModel || AI_DEFAULTS.aiApiModel;
  const vis = panelVisibility(mode);
  const isCustom = providerId === 'custom';
  const localModelId =
    preferredLocalModel && AI_LOCAL_MODELS.some((m) => m.id === preferredLocalModel)
      ? preferredLocalModel
      : profile.aiLocalModel || AI_DEFAULTS.aiLocalModel;

  const intro =
    source === 'dock' || source === 'tools'
      ? 'La IA recomendada es <strong>Mistral (Francia)</strong>, incluida en Telar. La primera vez te pedimos consentimiento: un resumen del caso sale de tu computador. Telar no lo guarda. Lo de este computador es más privado y suele responder peor.'
      : 'La IA recomendada es <strong>Mistral en Francia</strong>. Telar la incluye. El contexto no pasa por telarapp.cl. Antes de cada consulta puedes revisar exactamente qué se envía.';

  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card settings-ai-modal" role="dialog" aria-labelledby="ai-settings-title">
        <h2 id="ai-settings-title" class="modal-card__title">Asistente IA</h2>
        <p class="settings-ai-modal__intro">${intro}</p>
        <p class="settings-ai-modal__recommend">Recomendada: <strong>Mistral</strong> (Europa, un clic). En este computador: opcional y más floja.</p>
        <p class="settings-ai-slow" role="note">La IA en este computador tarda más y suele ser peor que Mistral.</p>
        <p class="settings-ai-busy" id="ai-download-lock" hidden>Descargando modelo. No cierres esta ventana hasta que termine.</p>
        <form id="ai-settings-form" class="settings-ai-form">
          <div class="settings-ai-split">
            <fieldset class="settings-ai-modes">
              <legend class="settings-ai-form__label">Modos</legend>
              ${AI_MODE_ORDER.map((id) => AI_MODES[id])
                .filter(Boolean)
                .map(
                  (m) => `
                <label class="settings-ai-mode${m.id === 'api' ? ' settings-ai-mode--preferred' : ''}">
                  <input type="radio" name="aiMode" value="${m.id}" ${mode === m.id ? 'checked' : ''} />
                  <span class="settings-ai-mode__text">
                    <strong>${escapeHtml(m.label)}</strong>
                    <small>${escapeHtml(m.description)}</small>
                  </span>
                </label>`,
                )
                .join('')}
            </fieldset>

            <div class="settings-ai-models-col">
              <p class="settings-ai-form__label" id="ai-models-legend">Modelos</p>
              <div id="ai-panel-local" class="settings-ai-panel settings-ai-panel--models" ${vis.local}>
                <div class="settings-ai-model-list" role="radiogroup" aria-labelledby="ai-models-legend">
                  ${localModelCardsHtml(localModelId)}
                </div>
                <p class="settings-ai-panel__hint">
                  Requiere <strong>Ollama</strong> en tu equipo. El check «Instalado» sale de los modelos que Ollama ya tiene.
                </p>
                <div id="ai-download-park" class="settings-ai-download-park">
                  <div class="settings-ai-download" id="ai-download-row" hidden>
                    <button type="button" class="btn btn-secondary btn-sm" id="ai-download-model">
                      Descargar este modelo
                    </button>
                    <span id="ai-download-status" class="settings-ai-test-status" aria-live="polite"></span>
                  </div>
                </div>
              </div>

              <div id="ai-panel-api-models" class="settings-ai-panel settings-ai-panel--models" ${vis.api}>
                <div id="ai-api-model-list" class="settings-ai-model-list" role="radiogroup">
                  ${apiModelCardsHtml(preset, apiModel)}
                </div>
                <input type="hidden" id="ai-api-model" name="aiApiModel" value="${escapeHtml(apiModel)}" />
              </div>
            </div>
          </div>

          <div id="ai-panel-api" class="settings-ai-panel" ${vis.api}>
            ${apiConsentBlockHtml(profile, providerId)}
            <label class="settings-ai-form__label" for="ai-api-provider">Servicio</label>
            <select id="ai-api-provider" name="aiApiProvider" class="input">
              ${presetOptionsHtml(providerId)}
            </select>
            <p id="ai-preset-desc" class="settings-ai-panel__hint">${escapeHtml(preset.description)}</p>

            <div id="ai-api-advanced" ${isCustom ? '' : 'hidden'}>
              <label class="settings-ai-form__label" for="ai-api-base">URL del servicio</label>
              <input type="url" id="ai-api-base" name="aiApiBase" class="input" autocomplete="off"
                placeholder="https://api.mistral.ai/v1"
                value="${escapeHtml(apiBase)}"
                ${isCustom ? '' : 'readonly'} />
            </div>

            <div id="ai-api-key-row" ${providerId === 'mistral' && telarProvisionsMistral() ? 'hidden' : ''}>
              <label class="settings-ai-form__label" for="ai-api-key">Clave (solo ChatGPT u otro)</label>
              <input type="password" id="ai-api-key" name="aiApiKey" class="input" autocomplete="off"
                placeholder="Se pega aquí; no la compartas"
                value="${escapeHtml(profile.aiApiKey || '')}" />
              <p id="ai-key-hint" class="settings-ai-panel__hint">${
                providerId === 'mistral'
                  ? 'Telar pide la clave al activar. No viaja en el instalador.'
                  : escapeHtml(preset.keyHint)
              }</p>
            </div>
            <p id="ai-mistral-included" class="settings-ai-panel__hint" ${
              providerId === 'mistral' ? '' : 'hidden'
            }>Mistral se activa con tu correo de Telar. La clave no viene en el instalador; queda solo en este computador.</p>

            <label class="ai-consent-notice__check">
              <input type="checkbox" name="aiPreviewAsk" ${profile.aiPreviewSkip ? '' : 'checked'} />
              <span>Revisar el contexto antes de cada consulta</span>
            </label>

            <div class="settings-ai-panel__actions">
              <button type="button" class="btn btn-secondary btn-sm" id="ai-test-connection" ${mode !== 'api' ? 'disabled' : ''}>
                Probar conexión
              </button>
              <span id="ai-test-status" class="settings-ai-test-status" aria-live="polite"></span>
            </div>
          </div>
        </form>
        <div class="modal-card__actions">
          <a class="btn btn-ghost" href="${IA_HELP_MAILTO}">Ayuda: contacto@telarapp.cl</a>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-save>Guardar</button>
        </div>
      </div>
    </div>`;

  const backdrop = root.querySelector('.modal-backdrop');
  const cancelBtn = root.querySelector('[data-cancel]');
  const saveBtn = root.querySelector('[data-save]');
  const lockNote = root.querySelector('#ai-download-lock');
  let settled = false;
  let downloading = false;

  const setDownloadLock = (on) => {
    downloading = on;
    if (backdrop) backdrop.dataset.modalLock = on ? '1' : '';
    if (cancelBtn) cancelBtn.disabled = on;
    if (saveBtn) saveBtn.disabled = on;
    if (lockNote) lockNote.hidden = !on;
  };

  const close = (saved) => {
    if (downloading) {
      toast('Espera a que termine la descarga del modelo');
      return;
    }
    if (settled) return;
    settled = true;
    root.innerHTML = '';
    if (saved) onSaved?.();
    else onCancel?.();
  };

  const form = root.querySelector('#ai-settings-form');
  const panelLocal = root.querySelector('#ai-panel-local');
  const panelApi = root.querySelector('#ai-panel-api');
  const panelApiModels = root.querySelector('#ai-panel-api-models');
  const apiModelList = root.querySelector('#ai-api-model-list');
  const downloadBtn = root.querySelector('#ai-download-model');
  const downloadRow = root.querySelector('#ai-download-row');
  const downloadStatus = root.querySelector('#ai-download-status');
  let installedModels = new Set();
  let installReady = false;
  const testBtn = root.querySelector('#ai-test-connection');
  const testStatus = root.querySelector('#ai-test-status');
  const providerSelect = root.querySelector('#ai-api-provider');
  const modelHidden = root.querySelector('#ai-api-model');
  const baseInput = root.querySelector('#ai-api-base');
  const keyHint = root.querySelector('#ai-key-hint');
  const presetDesc = root.querySelector('#ai-preset-desc');
  const syncApiModelHidden = () => {
    const chosen = form.querySelector('input[name="aiApiModelChoice"]:checked')?.value;
    if (modelHidden && chosen) modelHidden.value = chosen;
  };

  const refreshConsentNotice = (pid) => {
    const existing = root.querySelector('#ai-api-consent-notice');
    if (!existing) return;
    const draft = {
      ...loadProfile(),
      aiApiProvider: pid,
      aiApiBase: baseInput?.value?.trim() || getApiPreset(pid).baseUrl,
    };
    existing.outerHTML = apiConsentBlockHtml(draft, pid);
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
    const hideKey = pid === 'mistral' && telarProvisionsMistral();
    const keyRow = root.querySelector('#ai-api-key-row');
    const advanced = root.querySelector('#ai-api-advanced');
    const included = root.querySelector('#ai-mistral-included');
    if (keyRow) keyRow.hidden = hideKey;
    if (advanced) advanced.hidden = pid !== 'custom';
    if (included) included.hidden = !hideKey;
    if (keyHint) {
      keyHint.textContent = hideKey
        ? 'Telar pide la clave al activar. No viaja en el instalador.'
        : p.keyHint;
    }

    if (apiModelList) {
      const current = keepCustomModel ? modelHidden?.value : p.defaultModel;
      apiModelList.innerHTML = apiModelCardsHtml(p, current);
      if (modelHidden) {
        modelHidden.value =
          p.models?.length && !p.models.includes(current) ? p.defaultModel : current || p.defaultModel || '';
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

  const paintDownloadBtn = () => syncDownloadButton(root, downloadRow, downloadBtn, installedModels, installReady);

  const refreshInstallState = async () => {
    const next = await refreshLocalInstallBadges(root);
    installedModels = next.installed;
    installReady = true;
    paintDownloadBtn();
    return next;
  };

  const syncPanels = () => {
    const selected = form.querySelector('input[name="aiMode"]:checked')?.value || 'off';
    panelLocal.hidden = selected === 'api';
    if (panelApiModels) panelApiModels.hidden = selected !== 'api';
    panelApi.hidden = selected !== 'api';
    paintDownloadBtn();
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

  form.addEventListener('change', (e) => {
    if (e.target?.name === 'aiApiModelChoice') syncApiModelHidden();
    if (e.target?.name === 'aiLocalModel') paintDownloadBtn();
  });

  root.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
  root.querySelector('[data-close]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close(false);
  });

  downloadRow?.addEventListener('click', (e) => e.stopPropagation());
  downloadRow?.addEventListener('mousedown', (e) => e.stopPropagation());

  downloadBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTauriApp()) {
      toast('Descarga de modelos disponible en la app de escritorio');
      return;
    }
    const localModelId = form.querySelector('input[name="aiLocalModel"]:checked')?.value;
    if (!localModelId) return;

    downloadBtn.disabled = true;
    setDownloadLock(true);
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
      await refreshInstallState();
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
      setDownloadLock(false);
      paintDownloadBtn();
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
    if (p.id !== 'mistral' && p.keyRequired && !draftProfile.aiApiKey) {
      toast('Falta la clave para probar este servicio');
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

  root.querySelector('[data-save]')?.addEventListener('click', async () => {
    syncApiModelHidden();
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
      aiApiKey: presetOnSave.id === 'mistral' ? '' : String(fd.get('aiApiKey') || '').trim(),
      aiPreviewSkip: !fd.get('aiPreviewAsk'),
    };
    if (aiMode === 'api') {
      const profileNow = loadProfile();
      if (!patch.aiApiBase) {
        toast('Falta la dirección del servicio. Elige Mistral o Personalizado.');
        return;
      }
      if (!patch.aiApiModel) {
        toast('Elige un modelo de IA');
        return;
      }
      if (presetOnSave.id !== 'mistral' && presetOnSave.keyRequired && !patch.aiApiKey) {
        toast('Pega la clave de ChatGPT u otro servicio (empieza con sk-).');
        return;
      }
      const needsConsent = !hasAiApiConsent(profileNow);
      const consentBox = root.querySelector('#ai-api-consent');
      if (needsConsent && !consentBox?.checked) {
        toast('Marca el consentimiento para usar la IA en la nube');
        root.querySelector('#ai-api-consent-notice')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (needsConsent) {
        patch.aiApiConsentAt = new Date().toISOString();
      }
    }
    const next = saveProfile(patch);
    if (aiMode === 'api' && presetOnSave.id === 'mistral') {
      try {
        toast('Activando Mistral…');
        await ensureTelarMistralKey(next);
      } catch (err) {
        toast(err?.message || 'No se pudo activar Mistral. Revisa internet e inténtalo de nuevo.');
        return;
      }
    }
    toast('Preferencias de IA guardadas');
    close(true);
  });

  syncPanels();
  void refreshInstallState();
}
