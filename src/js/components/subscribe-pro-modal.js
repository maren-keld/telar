import { isProUser, loadProfile } from '../profile.js';
import { SUBSCRIPTION_PRICE_CLP, formatSubscriptionPriceCLP } from '../subscription-config.js';
import { openExternalUrl } from '../tauri-bridge.js';
import {
  activateDevPro,
  fetchSubscriptionHealth,
  getSubscriptionApiBase,
  syncProFromServer,
  tryActivatePro,
  verifyProSubscription,
} from '../subscription.js';

const PRO_FEATURES = [
  'Pacientes activos ilimitados',
  'Grabar sesiones de Neurofeedback y exportar CSV/PDF',
  'Exportar programa de tratamiento (PDF)',
  'Acceso a curso de Neurofeedback y mentoría',
  'Respaldo cifrado en la nube (carpeta sincronizada)',
];

const MP_SUBSCRIPTIONS_URL = 'https://www.mercadopago.cl/subscriptions';

export function openSubscribeProModal({ onSubscribed } = {}) {
  const pro = isProUser();
  const proEmail = (loadProfile().email || '').trim();
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
          En Demo tienes todos los packs clínicos, Neurofeedback en vivo y hasta <strong>8 pacientes activos</strong> (archivados o en pausa no cuentan).
          El Plan Profesional desbloquea:
        </p>
        <p class="subscribe-pro-modal__api-status" id="subscribe-pro-api-status" aria-live="polite" ${pro ? 'hidden' : ''}>Comprobando servidor de pagos…</p>
        <ul class="subscribe-pro-features">
          ${PRO_FEATURES.map((f) => `<li><span class="subscribe-pro-features__plus">+</span>${f}</li>`).join('')}
        </ul>
        ${pro ? `
        <p class="subscribe-pro-modal__active" style="text-align:center;font-weight:600;color:#2e7d4f">
          ✓ Suscripción activa${proEmail ? ` · ${proEmail}` : ''}
        </p>
        <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="subscribe-pro-manage">
          Cancelar o gestionar en Mercado Pago
        </button>
        <p class="subscribe-pro-modal__fine">
          Abre tu cuenta de Mercado Pago para ver pagos, cambiar tarjeta o cancelar.
          Si cancelas, Telar vuelve a Demo en el próximo chequeo (al abrir la app).
        </p>
        ` : `
        <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="subscribe-pro-btn">
          Suscribirse — ${formatSubscriptionPriceCLP(SUBSCRIPTION_PRICE_CLP)}
        </button>
        <button type="button" class="btn btn-ghost btn-block" id="subscribe-pro-dev" style="margin-top:8px" hidden>
          Activar Pro (solo desarrollo, sin pago)
        </button>
        <button type="button" class="btn btn-ghost btn-block" id="subscribe-pro-verify" style="margin-top:8px">
          Ya pagué — actualizar mi plan
        </button>
        <p class="subscribe-pro-modal__fine" id="subscribe-pro-pending" hidden>
          Tras pagar en Mercado Pago, vuelve a Telar: el plan se activará en unos segundos.
        </p>
        <p class="subscribe-pro-modal__fine">
          Pago seguro con Mercado Pago. Se cobra mensualmente; puedes cancelar desde tu cuenta MP.
        </p>
        `}
        <footer class="subscribe-pro-modal__foot">
          <a href="tel:+56920509726" class="subscribe-pro-modal__link">¿Tienes alguna pregunta? +56 9 2050 9726</a>
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

  overlay.querySelector('#subscribe-pro-manage')?.addEventListener('click', () => {
    openExternalUrl(MP_SUBSCRIPTIONS_URL);
  });

  overlay.querySelector('#subscribe-pro-help')?.addEventListener('click', () => {
    const url = 'mailto:soporte@telarapp.cl?subject=Suscripción%20Plan%20Profesional';
    openExternalUrl(url);
  });

  if (pro) return;

  fetchSubscriptionHealth()
    .then((health) => {
      if (!apiStatus) return;
      const mode = health.mp_test_mode ? 'modo prueba' : 'producción';
      if (health.dev_bypass) {
        overlay.querySelector('#subscribe-pro-dev')?.removeAttribute('hidden');
      }
      // El host de la API y la palabra «producción» no le dicen nada a un
      // psicologo; solo se muestran en modo prueba, que es cuando sirven.
      apiStatus.textContent = health.mp_configured
        ? health.mp_test_mode
          ? `Mercado Pago (${mode}) · ${getSubscriptionApiBase().replace(/^https?:\/\//, '')}`
          : 'Conectado con Mercado Pago'
        : 'El servidor de pagos no responde. Escríbenos y lo resolvemos.';
      apiStatus.classList.toggle('subscribe-pro-modal__api-status--ok', Boolean(health.mp_configured));
      if (health.mp_test_mode && health.dev_bypass) {
        const intro = overlay.querySelector('.subscribe-pro-modal__intro');
        intro?.insertAdjacentHTML(
          'afterend',
          `<p class="subscribe-pro-modal__warn">MP en sandbox es difícil de probar. Usa <strong>Activar Pro (solo desarrollo)</strong> para probar funciones Pro sin pagar.</p>`,
        );
      }
    })
    .catch((err) => {
      if (!apiStatus) return;
      const detail =
        typeof err === 'string'
          ? err
          : err?.message || 'No se pudo conectar con el servidor de suscripciones.';
      apiStatus.textContent = detail;
      apiStatus.classList.add('subscribe-pro-modal__api-status--err');
    });

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
    const onActivated = () => {
      close();
      onSubscribed?.();
    };
    window.addEventListener('telar:subscription-activated', onActivated, { once: true });
    await tryActivatePro({ onActivated });
    overlay.querySelector('#subscribe-pro-pending')?.removeAttribute('hidden');
    overlay.querySelector('#subscribe-pro-verify')?.removeAttribute('hidden');
  });

  overlay.querySelector('#subscribe-pro-dev')?.addEventListener('click', async () => {
    try {
      await activateDevPro();
      close();
      onSubscribed?.();
    } catch (e) {
      apiStatus.textContent = e?.message || 'No se pudo activar Pro en desarrollo';
      apiStatus.classList.add('subscribe-pro-modal__api-status--err');
    }
  });

  overlay.querySelector('#subscribe-pro-verify')?.addEventListener('click', async () => {
    const ok = await verifyProSubscription();
    if (ok) {
      close();
      onSubscribed?.();
    }
  });
}

export async function requireProOrSubscribe({ onAllowed }) {
  if (isProUser()) {
    onAllowed?.();
    return;
  }
  const { nowPro } = await syncProFromServer();
  if (nowPro) {
    onAllowed?.();
    return;
  }
  openSubscribeProModal({
    onSubscribed: () => onAllowed?.(),
  });
}
