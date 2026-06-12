/**
 * URLs públicas de instaladores. Actualiza cuando publiques en GitHub Releases o Vercel.
 * mac: ./scripts/sign-macos-app.sh → dist/Telar-macos.zip
 */
const DOWNLOAD_URLS = {
  mac: 'https://github.com/maren-keld/telar/releases/latest/download/Telar-macos.zip',
  windows: '', // .exe pendiente — DI-2
};

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const p = `${ua} ${platform}`.toLowerCase();
  if (/win/.test(p)) return 'windows';
  if (/mac|iphone|ipad|ipod/.test(p)) return 'mac';
  return 'other';
}

function applyDownloadButton() {
  const btn = document.getElementById('btn-download');
  if (!btn) return;

  const platform = detectPlatform();

  if (platform === 'mac' && DOWNLOAD_URLS.mac) {
    btn.href = DOWNLOAD_URLS.mac;
    btn.textContent = 'Descargar para macOS';
    btn.removeAttribute('download');
    btn.dataset.platform = 'mac';
    return;
  }

  if (platform === 'windows') {
    if (DOWNLOAD_URLS.windows) {
      btn.href = DOWNLOAD_URLS.windows;
      btn.textContent = 'Descargar para Windows';
      btn.dataset.platform = 'windows';
    } else {
      btn.href = '#contacto';
      btn.textContent = 'Windows — avísame';
      btn.dataset.platform = 'windows-pending';
      btn.addEventListener('click', (e) => {
        if (!DOWNLOAD_URLS.windows) {
          sessionStorage.setItem('contact-reason', 'windows-download');
        }
      });
    }
    return;
  }

  btn.href = '#requisitos';
  btn.textContent = 'Ver cómo instalar';
  btn.dataset.platform = 'other';
}

document.addEventListener('DOMContentLoaded', applyDownloadButton);
