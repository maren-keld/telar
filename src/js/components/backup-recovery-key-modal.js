import { exportRecoveryKeyPdf } from '../export-recovery-key-pdf.js';
import { escapeHtml, toast } from '../utils.js';
import { t } from '../i18n.js';

const RECOVERY_SHEET_FOOTER = `Telar — clave de recuperación de respaldo en la nube

Guarda este archivo fuera de tu computador. Con la herramienta open-source «rage» (formato age) también puedes descifrar tus respaldos aunque Telar deje de existir.

Si pierdes esta clave, los respaldos .age no se pueden recuperar. Telar no puede reponerla.`;

/**
 * Muestra la clave de recuperación una sola vez. No se cierra por accidente.
 * @returns {Promise<boolean>} true si el usuario confirmó que guardó la clave
 */
export function openBackupRecoveryKeyModal({ recoveryKey }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop backup-recovery-overlay">
        <div class="modal-card backup-recovery-modal" role="dialog" aria-labelledby="recovery-title" aria-modal="true">
          <header class="backup-recovery-modal__head">
            <div>
              <p class="backup-recovery-modal__eyebrow">Telar · ${t('settings.cloudBackupRecoverySheet')}</p>
              <h2 id="recovery-title" class="modal-card__title backup-recovery-modal__title">${t('settings.cloudBackupRecoveryTitle')}</h2>
            </div>
          </header>
          <p class="backup-recovery-modal__intro">${t('settings.cloudBackupRecoveryIntro')}</p>

          <div class="backup-recovery-key-box">
            <code id="recovery-key-value" class="backup-recovery-key-box__code">${escapeHtml(recoveryKey)}</code>
          </div>

          <div class="backup-recovery-actions">
            <button type="button" class="btn btn-secondary" id="recovery-copy">${t('settings.cloudBackupCopyKey')}</button>
            <button type="button" class="btn btn-secondary" id="recovery-download">${t('settings.cloudBackupDownloadKey')}</button>
            <button type="button" class="btn btn-secondary" id="recovery-pdf">${t('settings.cloudBackupPrintPdf')}</button>
          </div>

          <div class="backup-info-warning" role="alert">
            <p class="backup-info-warning__lead">⚠️ ${t('settings.cloudBackupInfoWarn')}</p>
          </div>

          <label class="backup-recovery-confirm">
            <input type="checkbox" id="recovery-ack" />
            <span>${t('settings.cloudBackupRecoveryAck')}</span>
          </label>

          <button type="button" class="btn btn-primary btn-block backup-recovery-modal__cta" id="recovery-continue" disabled>
            ${t('settings.cloudBackupContinue')}
          </button>
        </div>
      </div>`;

    const ack = root.querySelector('#recovery-ack');
    const cont = root.querySelector('#recovery-continue');

    ack?.addEventListener('change', () => {
      if (cont) cont.disabled = !ack.checked;
    });

    root.querySelector('#recovery-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(recoveryKey);
        toast(t('settings.cloudBackupCopied'));
      } catch {
        toast(t('settings.cloudBackupCopyFailed'));
      }
    });

    root.querySelector('#recovery-download')?.addEventListener('click', () => {
      const body = `${recoveryKey}\n\n${RECOVERY_SHEET_FOOTER}\n`;
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'telar-clave-recuperacion.txt';
      a.click();
      URL.revokeObjectURL(url);
    });

    root.querySelector('#recovery-pdf')?.addEventListener('click', async () => {
      try {
        await exportRecoveryKeyPdf(recoveryKey);
        toast(t('settings.cloudBackupPdfReady'));
      } catch {
        toast(t('settings.cloudBackupPdfFailed'));
      }
    });

    cont?.addEventListener('click', () => {
      if (!ack?.checked) return;
      root.innerHTML = '';
      resolve(true);
    });
  });
}
