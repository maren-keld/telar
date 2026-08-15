import { appVersionLabel } from './app-version.js';
import { t } from './i18n.js';
import { ensurePdfSpace, PDF_MARGIN as MARGIN, pdfText } from './pdf-utils.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';

/**
 * Hoja de recuperación imprimible (mismo pipeline que exportación PDF clínica).
 * @param {string} recoveryKey
 */
export async function exportRecoveryKeyPdf(recoveryKey) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  y = pdfText(doc, t('settings.cloudBackupRecoveryPdfTitle'), MARGIN, y, { size: 16, style: 'bold' });
  y += 4;
  y = pdfText(doc, t('settings.cloudBackupRecoveryPdfSubtitle'), MARGIN, y, { size: 11 });
  y += 8;

  y = pdfText(doc, t('settings.cloudBackupRecoveryPdfIntro'), MARGIN, y, { size: 10 });
  y += 8;

  y = pdfText(doc, recoveryKey, MARGIN, y, { size: 9, style: 'bold', maxWidth: 174 });
  y += 10;

  y = pdfText(doc, t('settings.cloudBackupRecoveryPdfRage'), MARGIN, y, { size: 9 });
  y += 8;

  y = ensurePdfSpace(doc, y, 24);
  y = pdfText(doc, t('settings.cloudBackupRecoveryPdfWarn'), MARGIN, y, { size: 10, style: 'bold' });
  y += 8;

  y = pdfText(doc, t('settings.cloudBackupRecoveryPdfSteps'), MARGIN, y, { size: 9 });
  y += 6;
  y = pdfText(
    doc,
    `${t('settings.cloudBackupRecoveryPdfGenerated')}: ${new Date().toLocaleString()} · ${appVersionLabel()}`,
    MARGIN,
    y,
    { size: 8 },
  );

  const filename = 'telar-hoja-recuperacion.pdf';
  if (isTauriApp()) {
    const bytes = doc.output('arraybuffer');
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new Uint8Array(bytes)),
      destination: null,
    });
    return filename;
  }

  doc.save(filename);
  return filename;
}
