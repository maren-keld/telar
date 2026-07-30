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
  if (/win/.test(p)) return 'windows';
  if (/mac|iphone|ipad|ipod/.test(p)) return 'mac';
  return 'other';
}

function getDownloadTarget() {
  const platform = detectPlatform();

  if (platform === 'mac') {
    return {
      href: DOWNLOAD_URLS.mac,
      label: 'Descargar para macOS',
      platform: 'mac',
    };
  }

  if (platform === 'windows') {
    return {
      href: DOWNLOAD_URLS.windows,
      label: 'Descargar para Windows',
      platform: 'windows',
    };
  }

  return {
    href: DOWNLOAD_URLS.all,
    label: 'Ver descargas',
    platform: 'other',
  };
}

function applyDownloadButtons() {
  const target = getDownloadTarget();

  document.querySelectorAll('[data-download]').forEach((button) => {
    button.href = target.href;
    const label = button.querySelector('.btn-label');
    if (label) {
      label.textContent = target.label;
    } else {
      button.textContent = target.label;
    }
    button.dataset.platform = target.platform;
    button.removeAttribute('download');
  });
}

document.addEventListener('DOMContentLoaded', applyDownloadButtons);
