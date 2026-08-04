import { t } from '../i18n.js';

/**
 * Popup explicativo — texto fijo según especificación del producto.
 */
export function openBackupInfoModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop subscribe-pro-overlay" data-close>
      <div class="subscribe-pro-modal backup-info-modal" role="dialog" aria-labelledby="backup-info-title">
        <aside class="subscribe-pro-modal__brand">
          <span class="subscribe-pro-modal__brand-name">Telar</span>
          <span class="subscribe-pro-modal__brand-tag">${t('settings.cloudBackup')}</span>
        </aside>
        <div class="subscribe-pro-modal__content backup-info-modal__content">
          <header class="subscribe-pro-modal__head">
            <h2 id="backup-info-title">${t('settings.cloudBackupInfoTitle')}</h2>
            <button type="button" class="modal-close" data-close aria-label="${t('settings.cancel')}">×</button>
          </header>

          <section class="backup-info-section">
            <h3 class="backup-info-section__title">${t('settings.cloudBackupInfoWhatTitle')}</h3>
            <p class="backup-info-section__body">${t('settings.cloudBackupInfoWhat')}</p>
          </section>

          <section class="backup-info-section">
            <h3 class="backup-info-section__title">${t('settings.cloudBackupInfoWhereTitle')}</h3>
            <p class="backup-info-section__body">${t('settings.cloudBackupInfoWhere')}</p>
          </section>

          <section class="backup-info-section">
            <h3 class="backup-info-section__title">${t('settings.cloudBackupInfoPrivacyTitle')}</h3>
            <p class="backup-info-section__body">${t('settings.cloudBackupInfoPrivacy')}</p>
          </section>

          <section class="backup-info-section">
            <h3 class="backup-info-section__title">${t('settings.cloudBackupInfoKeyTitle')}</h3>
            <p class="backup-info-section__body">${t('settings.cloudBackupInfoKey')}</p>
          </section>

          <div class="backup-info-warning" role="alert">
            <p class="backup-info-warning__lead">${t('settings.cloudBackupInfoWarn')}</p>
          </div>

          <section class="backup-info-section">
            <p class="backup-info-section__body backup-info-section__body--muted">${t('settings.cloudBackupInfoExportNote')}</p>
          </section>

          <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" data-close>${t('settings.cloudBackupGotIt')}</button>
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('.modal-close')?.addEventListener('click', close);
  root.querySelector('.subscribe-pro-modal__cta')?.addEventListener('click', close);
  root.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });
}
