import { bindPinBoxes, focusFirstEmpty, isValidPin, pinBoxesHtml, readPin } from '../components/pin-input.js';
import { BUILD_STAMP_LABEL } from '../build-info.js';
import { appVersionLabel } from '../app-version.js';
import { ICON_FINGERPRINT, ICON_LOCK } from '../icons.js';
import { loadProfile } from '../profile.js';
import { getInvoke, openExternalUrl } from '../tauri-bridge.js';
import { checkForAppUpdate, getPendingUpdate, installAppUpdate, promptAppUpdate } from '../app-updates.js';
import { seedDemoCaseIfNeeded } from '../demo-case-seed.js';
import { scheduleAutoCloudBackup, restoreCloudBackupFlow } from '../cloud-backup.js';
import { toast, escapeHtml } from '../utils.js';
import { t, tf } from '../i18n.js';
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
              <h3>${escapeHtml(t('unlock.hero.planTitle'))}</h3>
              <p>${escapeHtml(t('unlock.hero.planCopy'))}</p>
            </div>
          </article>
          <article class="hero-cam-card" data-frame="score">
            <div class="hero-cam-card__stage">
              <canvas data-visual="score" data-post="cad" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>${escapeHtml(t('unlock.hero.scoresTitle'))}</h3>
              <p>${escapeHtml(t('unlock.hero.scoresCopy'))}</p>
            </div>
          </article>
          <article class="hero-cam-card" data-frame="neuro">
            <div class="hero-cam-card__stage">
              <canvas data-visual="orb" data-post="ascii" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>Neurofeedback</h3>
              <p>${escapeHtml(t('unlock.hero.neuroCopy'))}</p>
            </div>
          </article>
          <article class="hero-cam-card" data-frame="lock">
            <div class="hero-cam-card__stage">
              <canvas data-visual="lock" data-post="cad" width="320" height="220" aria-hidden="true"></canvas>
            </div>
            <div class="hero-cam-card__body">
              <h3>${escapeHtml(t('unlock.hero.localTitle'))}</h3>
              <p>${escapeHtml(t('unlock.hero.localCopy'))}</p>
            </div>
          </article>
        </div>
      </div>
      <div class="hero-camera__controls">
        <button type="button" class="hero-camera__nav" data-cam-dir="-1" aria-label="${escapeHtml(t('unlock.previous'))}">‹</button>
        <div class="hero-camera__dots" role="tablist" aria-label="${escapeHtml(t('unlock.selectModule'))}">
          <button type="button" class="hero-camera__dot is-active" role="tab" aria-label="${escapeHtml(t('unlock.treatmentPrograms'))}" aria-selected="true"></button>
          <button type="button" class="hero-camera__dot" role="tab" aria-label="${escapeHtml(t('unlock.instantScores'))}" aria-selected="false"></button>
          <button type="button" class="hero-camera__dot" role="tab" aria-label="Neurofeedback" aria-selected="false"></button>
          <button type="button" class="hero-camera__dot" role="tab" aria-label="${escapeHtml(t('unlock.encrypted'))}" aria-selected="false"></button>
        </div>
        <button type="button" class="hero-camera__nav" data-cam-dir="1" aria-label="${escapeHtml(t('unlock.next'))}">›</button>
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
        ${escapeHtml(t('unlock.help'))}
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
    ? t('unlock.createPinIntro')
    : showTouchChoice
      ? t('unlock.chooseMethod')
      : t('unlock.enterPinIntro');

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
                 <button type="button" id="touchIdBtn" class="btn btn-primary unlock-method-btn" title="${escapeHtml(t('unlock.touch'))}">
                   <span class="unlock-method-btn__icon">${ICON_FINGERPRINT}</span>
                   <span>Touch ID</span>
                 </button>
                 <button type="button" id="usePinBtn" class="btn btn-secondary unlock-method-btn" title="${escapeHtml(t('unlock.pin'))}">
                   <span class="unlock-method-btn__icon">${ICON_LOCK}</span>
                   <span>PIN</span>
                 </button>
               </div>`
            : ''
        }
        <div id="unlockPinBlock" class="unlock-pin-block${showTouchChoice ? ' unlock-pin-block--hidden' : ''}">
          ${pinBoxesHtml('pin1', status.needs_setup ? t('unlock.newPin') : '')}
          ${status.needs_setup ? pinBoxesHtml('pin2', t('unlock.repeatPin')) : ''}
          <button id="unlockBtn" class="btn btn-primary unlock-actions__primary unlock-pin-block__submit">
            ${status.needs_setup ? t('unlock.create') : t('unlock.confirm')}
          </button>
        </div>
        <div id="hint" class="unlock-hint"></div>
      </div>
      <button type="button" class="unlock-restore-link" id="unlockRestoreBtn">
        ${escapeHtml(t('unlock.restoreBackup'))}
      </button>
      <p class="unlock-page__build">${escapeHtml(appVersionLabel())} · ${BUILD_STAMP_LABEL}</p>
      <div id="unlockUpdateBar" class="unlock-update-bar unlock-update-bar--hidden" role="status" aria-live="polite">
        <span class="unlock-update-bar__text">${escapeHtml(t('unlock.updateAvailable'))}</span>
        <button type="button" id="unlockUpdateBtn" class="btn btn-primary btn-sm">${escapeHtml(t('unlock.update'))}</button>
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
      toast(t('unlock.pinLength'));
      shakeEl(host.querySelector('[data-pin-row="pin1"]'));
      focusFirstEmpty(host, 'pin1');
      return;
    }
    if (status.needs_setup && p1 !== p2) {
      toast(t('unlock.pinMismatch'));
      shakeEl(host.querySelector('[data-pin-row="pin2"]'));
      focusFirstEmpty(host, 'pin2');
      return;
    }

    if (unlockBtn) unlockBtn.disabled = true;
    if (touchIdBtn) touchIdBtn.disabled = true;
    hint.textContent = status.needs_setup
      ? t('unlock.encrypting')
      : t('unlock.decrypting');
    try {
      const rememberTouchId = Boolean(touchAvailable && profile.useTouchId);
      await invoke('db_unlock', { pin: p1, remember_touch_id: rememberTouchId });
      if (status.needs_setup) {
        hint.textContent = t('unlock.preparingExample');
        if (window.__telarPacksReady) await window.__telarPacksReady;
        const demoTreatmentId = await seedDemoCaseIfNeeded({ firstSetup: true });
        hint.textContent = '';
        if (demoTreatmentId) {
          toast(t('unlock.exampleReady'));
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
          t('unlock.noFingerprint'),
        );
      } else {
        toast(t('unlock.enableTouch'));
      }
      return;
    }
    if (touchIdBtn) touchIdBtn.disabled = true;
    if (unlockBtn) unlockBtn.disabled = true;
    hint.textContent = t('unlock.waitingTouch');
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

  host.querySelector('#unlockRestoreBtn')?.addEventListener('click', async () => {
    const ok = await restoreCloudBackupFlow();
    if (!ok) return;
    scheduleAutoCloudBackup();
    onNavigate({ view: 'treatments' });
  });

  host.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && pinBlock && !pinBlock.classList.contains('unlock-pin-block--hidden')) {
      doUnlock();
    }
  });

  const updateBar = host.querySelector('#unlockUpdateBar');
  const updateBtn = host.querySelector('#unlockUpdateBtn');

  const showUpdateBar = (info) => {
    if (!info) return;
    promptAppUpdate(info);
    if (!updateBar) return;
    const label = updateBar.querySelector('.unlock-update-bar__text');
    if (label) label.textContent = tf('unlock.updateVersion', { version: info.version });
    updateBar.classList.remove('unlock-update-bar--hidden');
  };

  if (getPendingUpdate()) {
    showUpdateBar(getPendingUpdate());
  } else {
    checkForAppUpdate().then(showUpdateBar).catch(() => {});
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
