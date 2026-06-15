import { isProUser, loadProfile } from '../profile.js';
import { openExternalUrl } from '../tauri-bridge.js';
import {
  fetchSubscriptionHealth,
  getSubscriptionApiBase,
  isLocalSubscriptionApi,
  tryActivatePro,
  tryActivateProDevBypass,
  verifyProSubscription,
} from '../subscription.js';

const PRO_FEATURES = [
  'Grabar sesiones de Neurofeedback',
  'Compartir programas de tratamiento',
  'Comprar e instalar nuevos módulos',
  'Adjuntar documentos de referencia al espacio de trabajo',
  'Ver mapa de geolocalización de pacientes',
  'Acceso a actualizaciones y funciones experimentales',
];

export function openSubscribeProModal({ onSubscribed } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop subscribe-pro-overlay';
  overlay.innerHTML = `
    <div class="subscribe-pro-modal" role="dialog" aria-labelledby="subscribe-pro-title">
      <aside class="subscribe-pro-modal__brand">
        <span class="subscribe-pro-modal__brand-name">Telar</span>
        <span class="subscribe-pro-modal__brand-tag">Plan Profesional</span>
      </aside>
      <div class="subscribe-pro-modal__content">
        <header class="subscribe-pro-modal__head">
          <h2 id="subscribe-pro-title">Plan Profesional</h2>
          <button type="button" class="modal-close" aria-label="Cerrar">×</button>
        </header>
        <p class="subscribe-pro-modal__intro">
          Apoya el desarrollo de <strong>Telar</strong> y desbloquea funciones avanzadas del consultorio:
        </p>
        <p class="subscribe-pro-modal__api-status" id="subscribe-pro-api-status" aria-live="polite">Comprobando servidor de pagos…</p>
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
  const apiStatus = overlay.querySelector('#subscribe-pro-api-status');

  fetchSubscriptionHealth()
    .then((health) => {
      if (!apiStatus) return;
      if (health.dev_bypass) {
        apiStatus.textContent =
          'Desarrollo local: Mercado Pago no sirve aquí (vendedor real + comprador test). Activa Pro abajo, sin cobro.';
        apiStatus.classList.add('subscribe-pro-modal__api-status--ok');
        const cta = overlay.querySelector('#subscribe-pro-btn');
        const verify = overlay.querySelector('#subscribe-pro-verify');
        const fine = overlay.querySelector('.subscribe-pro-modal__fine');
        if (cta) {
          cta.textContent = 'Activar Pro (desarrollo local)';
          cta.onclick = async () => {
            const ok = await tryActivateProDevBypass();
            if (ok) {
              close();
              onSubscribed?.();
            }
          };
        }
        if (verify) verify.hidden = true;
        if (fine) {
          fine.textContent =
            'Sin Mercado Pago en esta Mac. Para cobrar de verdad: producción en Render + token APP_USR-.';
        }
        return;
      }
      const mode = health.mp_test_mode ? 'modo prueba' : 'producción';
      if (health.mp_test_mode && health.mp_sandbox_ready === false) {
        apiStatus.textContent =
          'Modo prueba: vendedor = cuenta real MP. Si falla el checkout, usa producción o comprador test en incógnito.';
        apiStatus.classList.add('subscribe-pro-modal__api-status--err');
      }
      if (health.mp_test_mode && health.mp_sandbox_ready === false && health.mp_sandbox_hint) {
        // hint largo solo en consola
        console.info('[subscription]', health.mp_sandbox_hint);
      }
      if (health.mp_test_mode && health.mp_sandbox_ready === false) {
        return;
      }
      apiStatus.textContent = health.mp_configured
        ? `Servidor conectado (${mode}) · ${getSubscriptionApiBase().replace(/^https?:\/\//, '')}`
        : 'Servidor sin credenciales de Mercado Pago — contacta soporte';
      apiStatus.classList.toggle('subscribe-pro-modal__api-status--ok', Boolean(health.mp_configured));
      apiStatus.classList.toggle('subscribe-pro-modal__api-status--err', !health.mp_configured);
    })
    .catch(() => {
      if (!apiStatus) return;
      const base = getSubscriptionApiBase();
      const localHint = isLocalSubscriptionApi()
        ? ''
        : ' Para pruebas en tu Mac: ejecuta la API local (server/) y define window.TELAR_SUBSCRIPTION_API = "http://127.0.0.1:5001".';
      apiStatus.textContent = `No se pudo conectar con ${base}.${localHint}`;
      apiStatus.classList.add('subscribe-pro-modal__api-status--err');
    });

  if (isLocalSubscriptionApi()) {
    fetchSubscriptionHealth().then((health) => {
      if (health.dev_bypass) return;
      overlay.querySelector('#subscribe-pro-btn')?.insertAdjacentHTML(
        'beforebegin',
        `<p class="subscribe-pro-modal__warn">
          <strong>Modo prueba MP:</strong> suscripciones sandbox en Chile suelen fallar.
          Usa <code>SUBSCRIPTION_DEV_BYPASS=1</code> en <code>server/.env</code> para probar Pro sin pagar.
        </p>`,
      );
    }).catch(() => {});
  }

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
    const url = 'mailto:soporte@telarapp.cl?subject=Suscripción%20Plan%20Profesional';
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
