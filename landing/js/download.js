/**
 * URLs públicas de instaladores. Actualiza cuando publiques en GitHub Releases o Vercel.
 * mac: ./scripts/sign-macos-app.sh → dist/Telar-macos.zip
 */
const DOWNLOAD_URLS = {
  mac: 'https://github.com/maren-keld/telar/releases/latest/download/Telar-macos.zip',
  windows: 'https://github.com/maren-keld/telar/releases/latest/download/Telar-windows.exe',
  all: 'https://github.com/maren-keld/telar/releases/latest',
};

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const p = `${ua} ${platform}`.toLowerCase();

  // Telar es solo de escritorio: al móvil no se le ofrece un instalador que no puede abrir.
  // iPadOS 13+ se anuncia como «Macintosh»; se distingue por el soporte táctil.
  const isIpadOS = /mac/.test(p) && (navigator.maxTouchPoints || 0) > 1;
  if (/iphone|ipad|ipod|android/.test(p) || isIpadOS) return 'mobile';

  if (/win/.test(p)) return 'windows';
  if (/mac/.test(p)) return 'mac';
  return 'other';
}

function getDownloadTarget(platformOverride) {
  const platform = platformOverride || detectPlatform();

  if (platform === 'mac') {
    return {
      href: DOWNLOAD_URLS.mac,
      label: 'Descargar para macOS',
      demoLabel: 'Descargar Demo Gratis (macOS)',
      platform: 'mac',
    };
  }

  if (platform === 'windows') {
    return {
      href: DOWNLOAD_URLS.windows,
      label: 'Descargar para Windows',
      demoLabel: 'Descargar Demo Gratis (Windows)',
      platform: 'windows',
    };
  }

  if (platform === 'mobile') {
    return {
      href: DOWNLOAD_URLS.all,
      label: 'Ver descargas (para computador)',
      platform: 'mobile',
    };
  }

  return {
    href: DOWNLOAD_URLS.all,
    label: 'Ver descargas',
    platform: 'other',
  };
}

function applyDownloadButtons(platformOverride) {
  const target = getDownloadTarget(platformOverride);

  document.querySelectorAll('[data-download]').forEach((button) => {
    const hideIfOther = button.hasAttribute('data-download-hide-other');

    if (hideIfOther && target.platform === 'other') {
      button.hidden = true;
      return;
    }

    button.hidden = false;
    button.href = target.href;
    const text = button.classList.contains('btn-lg') && target.demoLabel
      ? target.demoLabel
      : target.label;
    const label = button.querySelector('.btn-label');
    if (label) {
      label.textContent = text;
    } else {
      button.textContent = text;
    }
    button.dataset.platform = target.platform;
    button.removeAttribute('download');
  });

  document.querySelectorAll('[data-download-choice]').forEach((choice) => {
    const selected = choice.dataset.downloadChoice === target.platform;
    choice.classList.toggle('is-active', selected);
    choice.setAttribute('aria-pressed', String(selected));
  });
}

function initDownloads() {
  applyDownloadButtons();
  document.querySelectorAll('[data-download-choice]').forEach((choice) => {
    choice.addEventListener('click', () => {
      applyDownloadButtons(choice.dataset.downloadChoice);
    });
  });
}

document.addEventListener('DOMContentLoaded', initDownloads);
