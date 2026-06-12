import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { openEditFieldModal } from '../components/edit-field-modal.js';
import { openSubscribeProModal } from '../components/subscribe-pro-modal.js';
import { exportAllUserData } from '../export-user-data.js';
import { applyPresentationMode, isProUser, loadProfile, saveProfile, wipeProfileData } from '../profile.js';
import { getSubscriptionApiBase } from '../subscription.js';
import { BUILD_STAMP_LABEL } from '../build-info.js';
import { escapeHtml, toast } from '../utils.js';
import { openPinModal } from '../components/pin-modal.js';
import { checkForAppUpdate, getPendingUpdate, installAppUpdate } from '../app-updates.js';
import { getInvoke, isTauriApp } from '../tauri-bridge.js';

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
  const touchIdRow = touchIdAvailable
    ? row({
        icon: '👆',
        title: 'Desbloquear con Touch ID',
        subtitle: profile.useTouchId
          ? 'Activo en este Mac (desbloquea con huella tras configurar PIN)'
          : 'Usar huella en lugar del PIN cuando esté configurado',
        dataField: 'useTouchId',
        action: 'toggle',
        toggleOn: profile.useTouchId,
      })
    : isTauriApp() && isLinux
      ? `<div class="settings-row settings-row--static settings-row--disabled">
          <span class="settings-row__icon" aria-hidden="true">👆</span>
          <span class="settings-row__text">
            <span class="settings-row__title">Desbloquear con Touch ID</span>
            <span class="settings-row__sub">No disponible para Linux todavía</span>
          </span>
        </div>`
      : '';

  container.innerHTML = `
    ${renderAppSidebar('settings')}
    <div class="app-main">
      <div class="app-content settings-page">
        <h1 class="settings-page__title">Ajustes</h1>
        <div class="settings-card">
          ${row({ icon: '👤', title: 'Nombre', subtitle: profile.name || 'Sin configurar', dataField: 'name' })}
          ${row({ icon: '@', title: 'Correo electrónico', subtitle: profile.email || 'Sin configurar', dataField: 'email' })}
          ${row({ icon: '📱', title: 'Celular', subtitle: profile.phone || 'Sin configurar', dataField: 'phone' })}
          ${row({ icon: '📍', title: 'Dirección de atención', subtitle: profile.address || 'Sin configurar', dataField: 'address' })}
          ${row({
            icon: '🌙',
            title: 'Modo oscuro',
            dataField: 'darkMode',
            action: 'toggle',
            toggleOn: profile.darkMode,
          })}
        </div>
        <button type="button" class="settings-card settings-card--plan" id="btn-settings-plan">
          <div class="settings-plan">
            <span class="settings-plan__badge">${isProUser() ? 'Pro' : 'Free'}</span>
            <span class="settings-plan__text">
              <span class="settings-plan__label">Plan Profesional — Mercado Pago</span>
              <span class="settings-plan__sub">${escapeHtml(profile.email?.trim() || 'Configura tu email arriba')} · ${escapeHtml(getSubscriptionApiBase().replace(/^https?:\/\//, ''))}</span>
            </span>
            <span class="settings-row__chevron">›</span>
          </div>
        </button>
        <div class="settings-card">
          ${row({
            icon: '👁',
            title: 'Modo presentación',
            subtitle: profile.presentationMode
              ? 'Activo: datos sensibles ocultos en la app'
              : 'Oculta nombre, RUT, teléfono y correo hasta desactivarlo',
            dataField: 'presentationMode',
            action: 'toggle',
            toggleOn: profile.presentationMode,
          })}
        </div>
        <div class="settings-card">
          ${row({ icon: '🔒', title: 'Bloquear app', subtitle: 'Requerir PIN o Touch ID al abrir', dataField: 'lock' })}
          ${touchIdRow}
        </div>
        <h2 class="settings-section__title">Privacidad y datos</h2>
        <p class="settings-section__hint">Tus datos están solo en este dispositivo. Puedes exportarlos o borrarlos por completo.</p>
        <div class="settings-card">
          ${row({
            icon: '💾',
            title: 'Respaldar base de datos',
            subtitle: 'Copia telar.enc.db cifrada a Documentos/Telar/respaldos',
            dataField: 'backupDb',
          })}
          ${row({
            icon: '📥',
            title: 'Descargar mis datos',
            subtitle: 'Exportar pacientes, sesiones y perfil en CSV (carpeta en Documentos)',
            dataField: 'exportData',
          })}
          ${row({
            icon: '🗑',
            title: 'Eliminar todos mis datos',
            subtitle: 'Borra pacientes, tratamientos, notas y perfil. No se puede deshacer',
            dataField: 'wipeData',
            danger: true,
          })}
        </div>
        <div class="settings-card">
          <div class="settings-row settings-row--static">
            <span class="settings-row__icon" aria-hidden="true">ℹ</span>
            <span class="settings-row__text">
              <span class="settings-row__title">Versión</span>
              <span class="settings-row__sub">Build ${escapeHtml(BUILD_STAMP_LABEL)}</span>
            </span>
          </div>
          ${row({
            icon: '⬆',
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

  container.querySelector('#btn-settings-plan')?.addEventListener('click', () => {
    openSubscribeProModal();
  });

  const fields = {
    name: { title: 'Nombre', multiline: false },
    email: { title: 'Correo electrónico', multiline: false },
    phone: { title: 'Celular', multiline: false },
    address: { title: 'Dirección de atención', multiline: true },
  };

  container.querySelectorAll('.settings-row[data-field]').forEach((btn) => {
    const field = btn.dataset.field;
    if (!field || field === 'lock' || field === 'useTouchId') return;
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
          toast('Guardado');
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
