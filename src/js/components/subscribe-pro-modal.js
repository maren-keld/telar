import { isProUser, loadProfile } from '../profile.js';
import { openExternalUrl } from '../tauri-bridge.js';
import { tryActivatePro, verifyProSubscription } from '../subscription.js';

const PRO_FEATURES = [
  'Grabar sesiones de Neurofeedback',
  'Compartir programas de tratamiento',
  'Comprar e instalar nuevos módulos',
  'Añadir documentos a tu workspace estilo Notebook LM',
  'Ver mapa de geolocalización de pacientes',
  'Acceso a actualizaciones y funciones experimentales',
];

export function openSubscribeProModal({ onSubscribed } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop subscribe-pro-overlay';
  overlay.innerHTML = `
    <div class="subscribe-pro-modal" role="dialog" aria-labelledby="subscribe-pro-title">
      <aside class="subscribe-pro-modal__brand" aria-hidden="true">
        <div class="subscribe-pro-logo">
          <span class="subscribe-pro-logo__col"></span>
          <span class="subscribe-pro-logo__mid">
            <span></span><span></span>
          </span>
          <span class="subscribe-pro-logo__col"></span>
        </div>
      </aside>
      <div class="subscribe-pro-modal__content">
        <header class="subscribe-pro-modal__head">
          <h2 id="subscribe-pro-title">Plan Profesional</h2>
          <button type="button" class="modal-close" aria-label="Cerrar">×</button>
        </header>
        <p class="subscribe-pro-modal__intro">
          Suscribiéndote al Plan Profesional apoyarás el crecimiento de este proyecto, además de acceder a nuevas funciones:
        </p>
        <ul class="subscribe-pro-features">
          ${PRO_FEATURES.map((f) => `<li><span class="subscribe-pro-features__plus">+</span>${f}</li>`).join('')}
        </ul>
        <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="subscribe-pro-btn">
          Suscribirse — $15.000 CLP/mes
        </button>
        <button type="button" class="btn btn-ghost btn-block" id="subscribe-pro-verify" style="margin-top:8px">
          Ya pagué — verificar suscripción
        </button>
        <p class="subscribe-pro-modal__fine">
          Pago seguro con Mercado Pago. Se cobra mensualmente; puedes cancelar cuando quieras desde tu cuenta MP.
        </p>
        <footer class="subscribe-pro-modal__foot">
          <a href="tel:+56933913074" class="subscribe-pro-modal__link">¿Tienes alguna pregunta? +56 9 3391 3074</a>
          <button type="button" class="subscribe-pro-modal__link subscribe-pro-modal__link--btn" id="subscribe-pro-help">
            ¿Problemas con la suscripción?
          </button>
        </footer>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const profile = loadProfile();
  if (!profile.email?.trim()) {
    const intro = overlay.querySelector('.subscribe-pro-modal__intro');
    if (intro) {
      intro.insertAdjacentHTML(
        'afterend',
        '<p class="subscribe-pro-modal__warn">Configura tu email en <strong>Ajustes</strong> antes de suscribirte.</p>',
      );
    }
  }

  overlay.querySelector('#subscribe-pro-btn')?.addEventListener('click', async () => {
    await tryActivatePro();
  });

  overlay.querySelector('#subscribe-pro-verify')?.addEventListener('click', async () => {
    const ok = await verifyProSubscription();
    if (ok) {
      close();
      onSubscribed?.();
    }
  });

  overlay.querySelector('#subscribe-pro-help')?.addEventListener('click', () => {
    const url = 'mailto:soporte@psicoterapialab.com?subject=Suscripción%20Plan%20Profesional';
    openExternalUrl(url);
  });
}

export function requireProOrSubscribe({ onAllowed }) {
  if (isProUser()) {
    onAllowed?.();
    return;
  }
  openSubscribeProModal({
    onSubscribed: () => onAllowed?.(),
  });
}
