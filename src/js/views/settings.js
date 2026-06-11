import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { openEditFieldModal } from '../components/edit-field-modal.js';
import { openSubscribeProModal } from '../components/subscribe-pro-modal.js';
import { applyPresentationMode, isProUser, loadProfile, saveProfile } from '../profile.js';
import { BUILD_STAMP_LABEL } from '../build-info.js';
import { escapeHtml, toast } from '../utils.js';
import { openPinModal } from '../components/pin-modal.js';
import { getInvoke, isTauriApp } from '../tauri-bridge.js';

function row({ icon, title, subtitle, action = 'chevron', toggleOn = false, dataField }) {
  const control =
    action === 'toggle'
      ? `<label class="settings-toggle"><input type="checkbox" data-toggle="${dataField}" ${toggleOn ? 'checked' : ''} /><span class="settings-toggle__track"></span></label>`
      : `<span class="settings-row__chevron">›</span>`;

  const tag = action === 'toggle' ? 'div' : 'button';
  const typeAttr = action === 'toggle' ? '' : ' type="button"';

  return `
    <${tag}${typeAttr} class="settings-row${action === 'toggle' ? ' settings-row--static' : ''}" data-field="${dataField || ''}">
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
            <span class="settings-plan__label">Plan</span>
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
        <div class="settings-card">
          <div class="settings-row settings-row--static">
            <span class="settings-row__icon" aria-hidden="true">ℹ</span>
            <span class="settings-row__text">
              <span class="settings-row__title">Versión</span>
              <span class="settings-row__sub">Build ${escapeHtml(BUILD_STAMP_LABEL)}</span>
            </span>
          </div>
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
}
