import { bindPinBoxes, focusFirstEmpty, isValidPin, pinBoxesHtml, readPin } from '../components/pin-input.js';
import { BUILD_STAMP_LABEL } from '../build-info.js';
import { ICON_FINGERPRINT, ICON_LOCK } from '../icons.js';
import { loadProfile } from '../profile.js';
import { getInvoke } from '../tauri-bridge.js';
import { checkForAppUpdate, getPendingUpdate, installAppUpdate } from '../app-updates.js';
import { toast } from '../utils.js';

export async function renderUnlock(host, { onNavigate }) {
  const invoke = getInvoke();
  const profile = loadProfile();
  const status = await invoke('db_status');
  const touchAvailable = await invoke('touch_id_available');
  const touchStored = touchAvailable ? await invoke('touch_id_has_stored_key') : false;
  const showTouchChoice = touchAvailable && !status.needs_setup;

  const subtitle = status.needs_setup
    ? 'Crea un PIN de 6 dígitos para cifrar tu base de datos.'
    : showTouchChoice
      ? 'Elige cómo desbloquear la aplicación.'
      : 'Ingresa tu PIN de 6 dígitos para descifrar tu base de datos.';

  host.innerHTML = `
    <div class="app-content unlock-page">
      <div class="unlock-icon-circle" aria-hidden="true">🔒</div>
      <h1 class="unlock-page__title">Desbloquear</h1>
      <p class="unlock-page__sub" id="unlockSub">${subtitle}</p>

      <div class="card unlock-card">
        ${
          showTouchChoice
            ? `<div class="unlock-method-row">
                 <button type="button" id="touchIdBtn" class="btn btn-primary unlock-method-btn" title="Desbloquear con Touch ID">
                   <span class="unlock-method-btn__icon">${ICON_FINGERPRINT}</span>
                   <span>Touch ID</span>
                 </button>
                 <button type="button" id="usePinBtn" class="btn btn-secondary unlock-method-btn" title="Desbloquear con PIN">
                   <span class="unlock-method-btn__icon">${ICON_LOCK}</span>
                   <span>PIN</span>
                 </button>
               </div>`
            : ''
        }
        <div id="unlockPinBlock" class="unlock-pin-block${showTouchChoice ? ' unlock-pin-block--hidden' : ''}">
          ${pinBoxesHtml('pin1', status.needs_setup ? 'Nuevo PIN' : '')}
          ${status.needs_setup ? pinBoxesHtml('pin2', 'Repetir PIN') : ''}
          <button id="unlockBtn" class="btn btn-primary unlock-actions__primary unlock-pin-block__submit">
            ${status.needs_setup ? 'Crear y desbloquear' : 'Confirmar PIN'}
          </button>
        </div>
        <div id="hint" class="unlock-hint"></div>
      </div>
      <p class="unlock-page__build">${BUILD_STAMP_LABEL}</p>
      <div id="unlockUpdateBar" class="unlock-update-bar unlock-update-bar--hidden" role="status" aria-live="polite">
        <span class="unlock-update-bar__text">Actualización disponible</span>
        <button type="button" id="unlockUpdateBtn" class="btn btn-primary btn-sm">Actualizar</button>
      </div>
    </div>
  `;

  const pinBlock = host.querySelector('#unlockPinBlock');
  const unlockBtn = host.querySelector('#unlockBtn');
  const touchIdBtn = host.querySelector('#touchIdBtn');
  const usePinBtn = host.querySelector('#usePinBtn');
  const hint = host.querySelector('#hint');

  let pinBound = !showTouchChoice;

  const bindPinIfNeeded = () => {
    if (pinBound) return;
    bindPinBoxes(host, 'pin1');
    if (status.needs_setup) bindPinBoxes(host, 'pin2');
    pinBound = true;
  };

  const setMethod = (method) => {
    if (!showTouchChoice) return;
    const touchActive = method === 'touch';
    touchIdBtn?.classList.toggle('btn-primary', touchActive);
    touchIdBtn?.classList.toggle('btn-secondary', !touchActive);
    usePinBtn?.classList.toggle('btn-primary', !touchActive);
    usePinBtn?.classList.toggle('btn-secondary', touchActive);
    if (touchActive) {
      pinBlock?.classList.add('unlock-pin-block--hidden');
    } else {
      pinBlock?.classList.remove('unlock-pin-block--hidden');
      bindPinIfNeeded();
      focusFirstEmpty(host, 'pin1');
    }
  };

  if (showTouchChoice) {
    setMethod('touch');
  } else {
    bindPinIfNeeded();
    focusFirstEmpty(host, 'pin1');
  }

  const doUnlock = async () => {
    const p1 = readPin(host, 'pin1');
    const p2 = status.needs_setup ? readPin(host, 'pin2') : p1;

    if (!isValidPin(p1)) {
      toast('El PIN debe tener 6 dígitos');
      focusFirstEmpty(host, 'pin1');
      return;
    }
    if (status.needs_setup && p1 !== p2) {
      toast('Los PIN no coinciden');
      focusFirstEmpty(host, 'pin2');
      return;
    }

    if (unlockBtn) unlockBtn.disabled = true;
    if (touchIdBtn) touchIdBtn.disabled = true;
    hint.textContent = status.needs_setup
      ? 'Cifrando base de datos…'
      : 'Descifrando base de datos…';
    try {
      const rememberTouchId = Boolean(touchAvailable && profile.useTouchId);
      await invoke('db_unlock', { pin: p1, remember_touch_id: rememberTouchId });
      hint.textContent = '';
      onNavigate({ view: 'agenda' });
    } catch (e) {
      console.error(e);
      hint.textContent = '';
      toast(e?.message || String(e));
      if (unlockBtn) unlockBtn.disabled = false;
      if (touchIdBtn) touchIdBtn.disabled = false;
    }
  };

  const doTouchId = async () => {
    setMethod('touch');
    if (!touchStored) {
      if (profile.useTouchId) {
        toast(
          'Aún no hay huella guardada. Desbloquea una vez con PIN (Touch ID activado en Ajustes) o configúralo en Ajustes.',
        );
      } else {
        toast('Activa Touch ID en Ajustes e ingresa tu PIN una vez para vincular la huella.');
      }
      return;
    }
    if (touchIdBtn) touchIdBtn.disabled = true;
    if (unlockBtn) unlockBtn.disabled = true;
    hint.textContent = 'Esperando Touch ID…';
    try {
      await invoke('db_unlock_touch_id');
      hint.textContent = '';
      onNavigate({ view: 'agenda' });
    } catch (e) {
      console.error(e);
      hint.textContent = '';
      const msg = e?.message || String(e);
      if (!msg.toLowerCase().includes('cancel')) {
        toast(msg);
      }
      if (touchIdBtn) touchIdBtn.disabled = false;
      if (unlockBtn) unlockBtn.disabled = false;
    }
  };

  unlockBtn?.addEventListener('click', doUnlock);
  touchIdBtn?.addEventListener('click', doTouchId);
  usePinBtn?.addEventListener('click', () => setMethod('pin'));

  host.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && pinBlock && !pinBlock.classList.contains('unlock-pin-block--hidden')) {
      doUnlock();
    }
  });

  const updateBar = host.querySelector('#unlockUpdateBar');
  const updateBtn = host.querySelector('#unlockUpdateBtn');

  const showUpdateBar = (info) => {
    if (!updateBar || !info) return;
    const label = updateBar.querySelector('.unlock-update-bar__text');
    if (label) label.textContent = `Actualización ${info.version} disponible`;
    updateBar.classList.remove('unlock-update-bar--hidden');
  };

  if (getPendingUpdate()) {
    showUpdateBar(getPendingUpdate());
  } else {
    checkForAppUpdate().then(showUpdateBar);
  }

  document.addEventListener('app-update-status', (ev) => {
    if (ev.detail) showUpdateBar(ev.detail);
  });

  updateBtn?.addEventListener('click', async () => {
    updateBtn.disabled = true;
    try {
      await installAppUpdate();
    } catch (e) {
      toast(e?.message || String(e));
      updateBtn.disabled = false;
    }
  });
}
