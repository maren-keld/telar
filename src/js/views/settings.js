import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { openEditFieldModal } from '../components/edit-field-modal.js';
import { aiSettingsSummary } from '../ai-config.js';
import { exportAllUserData } from '../export-user-data.js';
import { applyPresentationMode, isProUser, loadProfile, saveProfile, wipeProfileData } from '../profile.js';
import { syncProFromServer } from '../subscription.js';
import { BUILD_STAMP_LABEL } from '../build-info.js';
import { escapeHtml, toast } from '../utils.js';
import { openPinModal } from '../components/pin-modal.js';
import { checkForAppUpdate, getPendingUpdate, installAppUpdate } from '../app-updates.js';
import { getInvoke, isTauriApp } from '../tauri-bridge.js';
import { getLocale, localeLabel, setLocale, t } from '../i18n.js';
import { SETTINGS_ICONS } from '../icons.js';

let settingsRenderGen = 0;

function isSettingsRoute() {
  const path = (location.hash.slice(1) || '/agenda').split('?')[0];
  const view = path.split('/').filter(Boolean)[0] || 'agenda';
  return view === 'settings';
}

const SETTINGS_ROW_SKIP_GENERIC = new Set([
  'lock',
  'useTouchId',
  'darkMode',
  'presentationMode',
  'usagePing',
  'locale',
  'backupDb',
  'exportData',
  'wipeData',
  'checkUpdate',
  'aiAssistant',
]);

function openLanguagePicker(onPick) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card" role="dialog" aria-labelledby="lang-title">
        <h2 id="lang-title" class="modal-card__title">${escapeHtml(t('settings.chooseLanguage'))}</h2>
        <div class="settings-lang-options">
          <button type="button" class="btn btn-secondary btn-block" data-lang="es">${escapeHtml(localeLabel('es'))}</button>
          <button type="button" class="btn btn-secondary btn-block" data-lang="en">${escapeHtml(localeLabel('en'))}</button>
        </div>
        <div class="modal-card__actions">
          <button type="button" class="btn btn-ghost" data-cancel>${escapeHtml(t('settings.cancel', 'Cancelar'))}</button>
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('[data-cancel]')?.addEventListener('click', close);
  root.querySelector('[data-close]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });
  root.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onPick(btn.dataset.lang);
      close();
    });
  });
}

function row({ icon, title, subtitle, action = 'chevron', toggleOn = false, dataField, danger = false }) {
  const control =
    action === 'toggle'
      ? `<label class="settings-toggle"><input type="checkbox" data-toggle="${dataField}" ${toggleOn ? 'checked' : ''} /><span class="settings-toggle__track"></span></label>`
      : `<span class="settings-row__chevron">›</span>`;

  const tag = action === 'toggle' ? 'div' : 'button';
  const typeAttr = action === 'toggle' ? '' : ' type="button"';
  const dangerClass = danger ? ' settings-row--danger' : '';

  return `
    <${tag}${typeAttr} class="settings-row${action === 'toggle' ? ' settings-row--static' : ''}${dangerClass}" data-field="${dataField || ''}">
      <span class="settings-row__icon" aria-hidden="true">${icon}</span>
      <span class="settings-row__text">
        <span class="settings-row__title">${escapeHtml(title)}</span>
        ${subtitle ? `<span class="settings-row__sub">${escapeHtml(subtitle)}</span>` : ''}
      </span>
      ${control}
    </${tag}>`;
}

export async function renderSettings(container, { onNavigate }) {
  const renderGen = ++settingsRenderGen;
  const profile = loadProfile();
  let touchIdAvailable = false;
  if (isTauriApp()) {
    try {
      touchIdAvailable = await getInvoke()('touch_id_available');
    } catch {
      touchIdAvailable = false;
    }
  }

  const isLinux = navigator.platform.toLowerCase().includes('linux');
  const locale = getLocale();
  const touchIdRow = touchIdAvailable
    ? row({
        icon: SETTINGS_ICONS.touchId,
        title: t('settings.touchId'),
        subtitle: profile.useTouchId ? t('settings.touchIdOn') : t('settings.touchIdOff'),
        dataField: 'useTouchId',
        action: 'toggle',
        toggleOn: profile.useTouchId,
      })
    : isTauriApp() && isLinux
      ? `<div class="settings-row settings-row--static settings-row--disabled">
          <span class="settings-row__icon" aria-hidden="true">${SETTINGS_ICONS.touchId}</span>
          <span class="settings-row__text">
            <span class="settings-row__title">${escapeHtml(t('settings.touchId'))}</span>
            <span class="settings-row__sub">${escapeHtml(t('settings.touchIdLinux'))}</span>
          </span>
        </div>`
      : '';

  container.innerHTML = `
    ${renderAppSidebar('settings')}
    <div class="app-main" id="settings">
      <div class="app-content settings-page">
        <h1 class="settings-page__title">${escapeHtml(t('settings.title'))}</h1>
        <div class="settings-card">
          ${row({ icon: SETTINGS_ICONS.name, title: t('settings.name'), subtitle: profile.name || '—', dataField: 'name' })}
          ${row({ icon: SETTINGS_ICONS.email, title: t('settings.email'), subtitle: profile.email || '—', dataField: 'email' })}
          ${row({ icon: SETTINGS_ICONS.phone, title: t('settings.phone'), subtitle: profile.phone || '—', dataField: 'phone' })}
          ${row({ icon: SETTINGS_ICONS.address, title: t('settings.address'), subtitle: profile.address || '—', dataField: 'address' })}
          ${row({
            icon: SETTINGS_ICONS.locale,
            title: t('settings.language'),
            subtitle: localeLabel(locale),
            dataField: 'locale',
          })}
          ${row({
            icon: SETTINGS_ICONS.darkMode,
            title: t('settings.darkMode'),
            dataField: 'darkMode',
            action: 'toggle',
            toggleOn: profile.darkMode,
          })}
        </div>
        <button type="button" class="settings-card settings-card--plan" id="btn-settings-plan">
          <div class="settings-plan">
            <span class="settings-plan__badge">${isProUser() ? 'Pro' : 'Free'}</span>
            <span class="settings-plan__text">
              <span class="settings-plan__label">Plan Profesional — Telar</span>
              <span class="settings-plan__sub">${isProUser() ? 'Suscripción activa' : 'Gratis'} · ${escapeHtml(profile.email?.trim() || 'Configura tu email arriba')}</span>
            </span>
            <span class="settings-row__chevron">›</span>
          </div>
        </button>
        <div class="settings-card">
          ${row({
            icon: SETTINGS_ICONS.presentation,
            title: t('settings.presentationMode'),
            subtitle: profile.presentationMode ? t('settings.presentationOn') : t('settings.presentationOff'),
            dataField: 'presentationMode',
            action: 'toggle',
            toggleOn: profile.presentationMode,
          })}
        </div>
        <div class="settings-card">
          ${row({ icon: SETTINGS_ICONS.lock, title: t('settings.lock'), subtitle: t('settings.lockSub'), dataField: 'lock' })}
          ${touchIdRow}
        </div>
        <div class="settings-section">
          <h2 class="settings-section__title">Asistente IA</h2>
          <p class="settings-section__hint">
            Elige IA local privada (modelo aparte, sin salir del Mac) o tu API externa. Sin modelos embebidos en Telar.app.
          </p>
        </div>
        <div class="settings-card">
          ${row({
            icon: SETTINGS_ICONS.ai,
            title: 'Proveedor de IA',
            subtitle: aiSettingsSummary(profile),
            dataField: 'aiAssistant',
          })}
        </div>
        <div class="settings-section">
          <h2 class="settings-section__title">${escapeHtml(t('settings.privacyTitle'))}</h2>
          <p class="settings-section__hint">${escapeHtml(t('settings.privacyHint'))}</p>
        </div>
        <div class="settings-card">
          ${row({
            icon: SETTINGS_ICONS.usagePing,
            title: t('settings.usagePing', 'Contador anónimo de uso'),
            subtitle: profile.usagePingOptOut
              ? t('settings.usagePingOff', 'Desactivado — no se envía ningún ping')
              : t('settings.usagePingOn', 'Activo (predeterminado) — solo versión de app 1×/día; anónimo, sin IP ni datos clínicos'),
            dataField: 'usagePing',
            action: 'toggle',
            toggleOn: !profile.usagePingOptOut,
          })}
          ${row({
            icon: SETTINGS_ICONS.backup,
            title: t('settings.backup'),
            subtitle: t('settings.backupSub'),
            dataField: 'backupDb',
          })}
          ${row({
            icon: SETTINGS_ICONS.export,
            title: t('settings.export'),
            subtitle: t('settings.exportSub'),
            dataField: 'exportData',
          })}
          ${row({
            icon: SETTINGS_ICONS.wipe,
            title: t('settings.wipe'),
            subtitle: t('settings.wipeSub'),
            dataField: 'wipeData',
            danger: true,
          })}
        </div>
        <div class="settings-card">
          <div class="settings-row settings-row--static">
            <span class="settings-row__icon" aria-hidden="true">${SETTINGS_ICONS.info}</span>
            <span class="settings-row__text">
              <span class="settings-row__title">${escapeHtml(t('settings.version'))}</span>
              <span class="settings-row__sub">Build ${escapeHtml(BUILD_STAMP_LABEL)}</span>
            </span>
          </div>
          ${row({
            icon: SETTINGS_ICONS.update,
            title: getPendingUpdate() ? `Actualizar a ${getPendingUpdate().version}` : 'Buscar actualizaciones',
            subtitle: getPendingUpdate()
              ? 'Hay una versión nueva lista para instalar'
              : 'Comprueba si hay una versión nueva en GitHub Releases',
            dataField: 'checkUpdate',
          })}
        </div>
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  syncProFromServer().then(({ changed, revoked }) => {
    if (renderGen !== settingsRenderGen) return;
    if (!isSettingsRoute()) return;
    if (!changed) return;
    if (revoked) {
      toast(
        t(
          'settings.proRevoked',
          'La suscripción Profesional no está activa. Algunas funciones quedaron limitadas.',
        ),
      );
    }
    renderSettings(container, { onNavigate });
  });

  container.querySelector('#btn-settings-plan')?.addEventListener('click', () => {
    openSubscribeProModal();
  });

  container.querySelector('[data-field="locale"]')?.addEventListener('click', () => {
    openLanguagePicker((code) => {
      if (code === getLocale()) return;
      setLocale(code);
      toast(t('toast.langChanged'));
      renderSettings(container, { onNavigate });
    });
  });

  container.querySelector('[data-field="aiAssistant"]')?.addEventListener('click', async () => {
    const { openAiSettingsModal } = await import('../components/open-ai-settings-modal.js');
    openAiSettingsModal({
      onSaved: () => renderSettings(container, { onNavigate }),
    });
  });

  const fields = {
    name: { title: t('settings.name'), multiline: false },
    email: { title: t('settings.email'), multiline: false },
    phone: { title: t('settings.phone'), multiline: false },
    address: { title: t('settings.address'), multiline: true },
  };

  container.querySelectorAll('.settings-row[data-field]').forEach((btn) => {
    const field = btn.dataset.field;
    if (!field || SETTINGS_ROW_SKIP_GENERIC.has(field)) return;
    btn.addEventListener('click', () => {
      const def = fields[field];
      if (!def) return;
      const profileNow = loadProfile();
      openEditFieldModal({
        title: def.title,
        value: profileNow[field] || '',
        multiline: def.multiline,
        onSave: async (value) => {
          saveProfile({ [field]: value });
          renderSettings(container, { onNavigate });
          toast(t('toast.saved'));
        },
      });
    });
  });

  container.querySelector('[data-toggle="darkMode"]')?.addEventListener('change', (e) => {
    saveProfile({ darkMode: e.target.checked });
    toast(e.target.checked ? 'Modo oscuro activado' : 'Modo claro activado');
  });

  container.querySelector('[data-toggle="presentationMode"]')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    saveProfile({ presentationMode: on });
    applyPresentationMode(on);
    toast(on ? 'Modo presentación activado' : 'Modo presentación desactivado');
  });

  container.querySelector('[data-toggle="usagePing"]')?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    saveProfile({ usagePingOptOut: !enabled });
    toast(enabled ? t('settings.usagePingEnabled', 'Contador anónimo activado') : t('settings.usagePingDisabled', 'Contador anónimo desactivado'));
    const sub = e.target.closest('.settings-row')?.querySelector('.settings-row__sub');
    if (sub) {
      sub.textContent = enabled
        ? t('settings.usagePingOn', 'Activo (predeterminado) — solo versión de app 1×/día; anónimo, sin IP ni datos clínicos')
        : t('settings.usagePingOff', 'Desactivado — no se envía ningún ping');
    }
  });

  container.querySelector('[data-toggle="useTouchId"]')?.addEventListener('change', async (e) => {
    const input = e.target;
    const on = input.checked;

    if (!on) {
      saveProfile({ useTouchId: false });
      if (isTauriApp()) {
        try {
          getInvoke()('touch_id_clear_stored_key');
        } catch {
          /* ignore */
        }
      }
      toast('Touch ID desactivado');
      return;
    }

    if (!isTauriApp()) {
      input.checked = false;
      return;
    }

    input.checked = false;

    openPinModal({
      title: 'Ingresa tu PIN para activar Touch ID',
      submitLabel: 'Activar Touch ID',
      onCancel: () => {
        saveProfile({ useTouchId: false });
      },
      onSubmit: async (pin) => {
        try {
          await getInvoke()('touch_id_register_pin', { pin });
          saveProfile({ useTouchId: true });
          renderSettings(container, { onNavigate });
          toast('Touch ID configurado');
        } catch (err) {
          console.error(err);
          toast(err?.message || String(err));
          throw err;
        }
      },
    });
  });

  container.querySelector('[data-field="lock"]')?.addEventListener('click', () => {
    try {
      const invoke = getInvoke();
      invoke('db_lock');
      onNavigate({ view: 'unlock' });
    } catch (e) {
      console.error(e);
      toast('No se pudo bloquear');
    }
  });

  container.querySelector('[data-field="checkUpdate"]')?.addEventListener('click', async () => {
    if (!isTauriApp()) {
      toast('Disponible solo en la app de escritorio');
      return;
    }
    const btn = container.querySelector('[data-field="checkUpdate"]');
    btn?.setAttribute('disabled', 'true');
    try {
      const info = await checkForAppUpdate();
      if (info) {
        await installAppUpdate();
      } else {
        toast('Ya tienes la última versión');
      }
    } catch (err) {
      console.error(err);
      toast(err?.message || String(err));
    } finally {
      btn?.removeAttribute('disabled');
    }
  });

  container.querySelector('[data-field="backupDb"]')?.addEventListener('click', async () => {
    if (!isTauriApp()) {
      toast('Disponible solo en la app de escritorio');
      return;
    }
    const btn = container.querySelector('[data-field="backupDb"]');
    btn?.setAttribute('disabled', 'true');
    toast('Creando respaldo…');
    try {
      const path = await getInvoke()('db_backup_encrypted');
      toast('Respaldo guardado. Carpeta abierta en Finder.');
      console.info('Respaldo:', path);
    } catch (err) {
      console.error(err);
      toast(err?.message || String(err));
    } finally {
      btn?.removeAttribute('disabled');
    }
  });

  container.querySelector('[data-field="exportData"]')?.addEventListener('click', async () => {
    if (!isTauriApp()) {
      toast('Disponible solo en la app de escritorio');
      return;
    }
    const btn = container.querySelector('[data-field="exportData"]');
    btn?.setAttribute('disabled', 'true');
    toast('Preparando exportación…');
    try {
      const folderPath = await exportAllUserData();
      toast(`Datos exportados. Carpeta abierta en Finder.`);
      console.info('Exportación:', folderPath);
    } catch (err) {
      console.error(err);
      toast(err?.message || String(err));
    } finally {
      btn?.removeAttribute('disabled');
    }
  });

  container.querySelector('[data-field="wipeData"]')?.addEventListener('click', async () => {
    if (!isTauriApp()) {
      toast('Disponible solo en la app de escritorio');
      return;
    }

    const first = await openConfirmModal({
      title: '¿Eliminar todos los datos?',
      message:
        'Se borrarán permanentemente todos los pacientes, tratamientos, sesiones, notas, grabaciones de neurofeedback, convenios y tu perfil profesional en esta app. El PIN de acceso se conserva. Esta acción no se puede deshacer.',
      confirmLabel: 'Continuar',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!first) return;

    const typed = await openTypedConfirmModal({
      title: 'Confirmar eliminación',
      message: 'Escribe ELIMINAR (en mayúsculas) para confirmar que deseas borrar todos los datos.',
      expected: 'ELIMINAR',
    });
    if (!typed) return;

    const pinOk = await new Promise((resolve) => {
      openPinModal({
        title: 'Ingresa tu PIN para confirmar',
        submitLabel: 'Eliminar todo',
        onCancel: () => resolve(false),
        onSubmit: async (pin) => {
          await getInvoke()('db_unlock', { pin, rememberTouchId: false });
          resolve(true);
        },
      });
    });
    if (!pinOk) return;

    try {
      await getInvoke()('db_wipe_all_data');
      wipeProfileData();
      applyPresentationMode(false);
      toast('Todos tus datos han sido eliminados de este dispositivo. Tu PIN sigue activo.');
      onNavigate({ view: 'agenda' });
    } catch (err) {
      console.error(err);
      toast(err?.message || String(err));
    }
  });
}

function openTypedConfirmModal({ title, message, expected }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal-card confirm-modal" role="alertdialog" aria-labelledby="typed-confirm-title">
          <h2 id="typed-confirm-title" class="modal-card__title">${escapeHtml(title)}</h2>
          <p class="confirm-modal__message">${escapeHtml(message)}</p>
          <input type="text" class="input" id="typed-confirm-input" autocomplete="off" spellcheck="false" style="width:100%;margin-top:12px" />
          <div class="modal-card__actions">
            <button type="button" class="btn btn-secondary" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-danger" data-confirm disabled>Eliminar todo</button>
          </div>
        </div>
      </div>`;

    const input = root.querySelector('#typed-confirm-input');
    const confirmBtn = root.querySelector('[data-confirm]');

    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };

    input?.addEventListener('input', () => {
      if (confirmBtn) confirmBtn.disabled = input.value !== expected;
    });

    root.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    confirmBtn?.addEventListener('click', () => {
      if (input?.value === expected) close(true);
    });
    root.querySelector('[data-close]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(false);
    });

    input?.focus();
  });
}
