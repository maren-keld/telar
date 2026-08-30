import { bindPinBoxes, focusFirstEmpty, isValidPin, pinBoxesHtml, readPin } from '../components/pin-input.js';
import { BUILD_STAMP_LABEL } from '../build-info.js';
import { appVersionLabel } from '../app-version.js';
import { ICON_FINGERPRINT, ICON_LOCK } from '../icons.js';
import { loadProfile } from '../profile.js';
import { getInvoke, openExternalUrl } from '../tauri-bridge.js';
import { checkForAppUpdate, getPendingUpdate, installAppUpdate } from '../app-updates.js';
import { seedDemoCaseIfNeeded } from '../demo-case-seed.js';
import { scheduleAutoCloudBackup } from '../cloud-backup.js';
import { toast, escapeHtml } from '../utils.js';
import { shakeEl } from '../transitions.js';
import { mountHeroCameras } from '../hero-camera.js';

const HELP_CONTACT_URL = 'mailto:contacto@telarapp.cl';
const HELP_CONTACT_LABEL = 'contacto@telarapp.cl';

function unlockHeroCameraHtml() {
  return `
    <div class="hero-camera" data-hero-camera data-hero-autopause="0">
      <div class="hero-camera__viewport">
        <div class="hero-camera__scene">
          <article class="hero-cam-card is-active" data-frame="ia">
            <div class="hero-cam-card__stage">
              <canvas data-visual="lego" data-post="ascii" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>Programa sobre la ficha</h3>
              <p>La IA viene apagada. Si la activas, propone sesiones y módulos; tú aplicas.</p>
            </div>
          </article>
          <article class="hero-cam-card" data-frame="score">
            <div class="hero-cam-card__stage">
              <canvas data-visual="score" data-post="cad" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>Puntajes y curva</h3>
              <p>Escalas con scoring automático y seguimiento longitudinal.</p>
            </div>
          </article>
          <article class="hero-cam-card" data-frame="neuro">
            <div class="hero-cam-card__stage">
              <canvas data-visual="orb" data-post="ascii" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>Neurofeedback</h3>
              <p>Entrenamiento de atención y calma con Muse, en la consulta.</p>
            </div>
          </article>
          <article class="hero-cam-card" data-frame="lock">
            <div class="hero-cam-card__stage">
              <canvas data-visual="lock" data-post="cad" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>La ficha en tu computador</h3>
              <p>Cifrado local y respaldo cifrado en tu nube. No es un chat en la nube.</p>
            </div>
          </article>
        </div>
      </div>
      <div class="hero-camera__controls">
        <button type="button" class="hero-camera__nav" data-cam-dir="-1" aria-label="Módulo anterior">‹</button>
        <div class="hero-camera__dots" role="tablist" aria-label="Seleccionar módulo">
          <button type="button" class="hero-camera__dot is-active" role="tab" aria-label="Programas de psicoterapia" aria-selected="true"></button>
          <button type="button" class="hero-camera__dot" role="tab" aria-label="Puntajes instantáneos" aria-selected="false"></button>
          <button type="button" class="hero-camera__dot" role="tab" aria-label="Neurofeedback" aria-selected="false"></button>
          <button type="button" class="hero-camera__dot" role="tab" aria-label="Todo encriptado" aria-selected="false"></button>
        </div>
        <button type="button" class="hero-camera__nav" data-cam-dir="1" aria-label="Módulo siguiente">›</button>
      </div>
    </div>`;
}

function unlockShellHtml(innerHtml) {
  return `
    <div id="initialScreen" class="initial-screen initial-screen--hero">
      <div class="initial-screen__center">
        <div id="unlockInner">${innerHtml}</div>
        <div class="initial-screen__camera">${unlockHeroCameraHtml()}</div>
      </div>
      <p class="initial-screen__help">
        ¿Necesitas orientación o ayuda?
        <a class="initial-screen__help-link" id="unlockHelpContact" href="${HELP_CONTACT_URL}">${HELP_CONTACT_LABEL}</a>
      </p>
    </div>`;
}

function bindUnlockHelp(host) {
  host.querySelector('#unlockHelpContact')?.addEventListener('click', (e) => {
    e.preventDefault();
    void openExternalUrl(HELP_CONTACT_URL);
  });
}

export async function renderUnlock(host, { onNavigate }) {
  host.innerHTML = unlockShellHtml(`
    <header class="initial-screen__brand">
      <h1 class="initial-screen__title">Telar</h1>
    </header>
  `);
  mountHeroCameras(host);
  bindUnlockHelp(host);

  const invoke = getInvoke();
  const profile = loadProfile();
  if (typeof window !== 'undefined') window.__telarStage = 'unlock:db_status';
  const status = await invoke('db_status');
  if (typeof window !== 'undefined') window.__telarStage = 'unlock:touch_available';
  const touchAvailable = await invoke('touch_id_available');
  if (typeof window !== 'undefined') window.__telarStage = 'unlock:touch_stored';
  const touchStored = touchAvailable ? await invoke('touch_id_has_stored_key') : false;
  if (typeof window !== 'undefined') window.__telarStage = 'unlock:render';
  const showTouchChoice = touchAvailable && !status.needs_setup;

  const subtitle = status.needs_setup
    ? 'Crea un PIN de 6 dígitos para cifrar tu base de datos.'
    : showTouchChoice
      ? 'Elige cómo desbloquear la aplicación.'
      : 'Ingresa tu PIN de 6 dígitos para descifrar tu base de datos.';

  const inner = host.querySelector('#unlockInner');
  if (inner) {
    inner.innerHTML = `
      <header class="initial-screen__brand">
        <h1 class="initial-screen__title">Telar</h1>
      </header>
      <p class="initial-screen__sub" id="unlockSub">${subtitle}</p>

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
      <p class="unlock-page__build">${escapeHtml(appVersionLabel())} · ${BUILD_STAMP_LABEL}</p>
      <div id="unlockUpdateBar" class="unlock-update-bar unlock-update-bar--hidden" role="status" aria-live="polite">
        <span class="unlock-update-bar__text">Actualización disponible</span>
        <button type="button" id="unlockUpdateBtn" class="btn btn-primary btn-sm">Actualizar</button>
      </div>
    `;
  }

  const pinBlock = host.querySelector('#unlockPinBlock');
  const unlockBtn = host.querySelector('#unlockBtn');
  const touchIdBtn = host.querySelector('#touchIdBtn');
  const usePinBtn = host.querySelector('#usePinBtn');
  const hint = host.querySelector('#hint');

  let pinBound = false;

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
      shakeEl(host.querySelector('[data-pin-row="pin1"]'));
      focusFirstEmpty(host, 'pin1');
      return;
    }
    if (status.needs_setup && p1 !== p2) {
      toast('Los PIN no coinciden');
      shakeEl(host.querySelector('[data-pin-row="pin2"]'));
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
      if (status.needs_setup) {
        hint.textContent = 'Preparando caso de ejemplo…';
        if (window.__telarPacksReady) await window.__telarPacksReady;
        const demoTreatmentId = await seedDemoCaseIfNeeded({ firstSetup: true });
        hint.textContent = '';
        if (demoTreatmentId) {
          toast('Listo. Dejamos un caso de ejemplo para que veas cómo funciona.');
        }
      } else {
        hint.textContent = '';
      }
      scheduleAutoCloudBackup();
      onNavigate({ view: 'treatments' });
    } catch (e) {
      console.error(e);
      hint.textContent = '';
      toast(e?.message || String(e));
      shakeEl(host.querySelector('[data-pin-row="pin1"]'));
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
      scheduleAutoCloudBackup();
      onNavigate({ view: 'treatments' });
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
