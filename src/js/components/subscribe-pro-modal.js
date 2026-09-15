import { isProUser, loadProfile } from '../profile.js';
import {
  FREE_ACTIVE_PATIENT_LIMIT,
  SUBSCRIPTION_ANNUAL_PRICE_CLP,
  SUBSCRIPTION_PRICE_CLP,
  formatSubscriptionPriceCLP,
} from '../subscription-config.js';
import { openExternalUrl } from '../tauri-bridge.js';
import { playOverlayOpen, animateAndRemove } from '../transitions.js';
import { clinicCountryCode } from '../clinic-country.js';
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
  'Acceso a curso de Neurofeedback y mentoría',
  'Respaldo cifrado en la nube (carpeta sincronizada)',
];

const SUPPORT_MAIL = 'support@telarapp.cl';

const MP_SUBSCRIPTIONS_URL = 'https://www.mercadopago.cl/subscriptions';

export function openSubscribeProModal({ onSubscribed } = {}) {
  const pro = isProUser();
  const proEmail = (loadProfile().email || '').trim();
  const isUsa = clinicCountryCode() === 'US';
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop subscribe-pro-overlay';
  const ctaBlock = pro
    ? `
        <p class="subscribe-pro-modal__active" style="text-align:center;font-weight:600;color:#2e7d4f">
          ✓ Suscripción activa${proEmail ? ` · ${proEmail}` : ''}
        </p>
        <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="subscribe-pro-manage">
          ${isUsa ? `Contactar ${SUPPORT_MAIL}` : 'Cancelar o gestionar en Mercado Pago'}
        </button>
        <p class="subscribe-pro-modal__fine">
          ${
            isUsa
              ? `Para gestionar Plus en USA escribe a ${SUPPORT_MAIL}.`
              : 'Abre tu cuenta de Mercado Pago para ver pagos, cambiar tarjeta o cancelar. Si cancelas, Telar vuelve a Demo en el próximo chequeo (al abrir la app).'
          }
        </p>`
    : isUsa
      ? `
        <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="subscribe-pro-usa">
          Contactar ${SUPPORT_MAIL} — Plus USA
        </button>
        <p class="subscribe-pro-modal__fine">
          En Estados Unidos el Plan Profesional (Plus) se activa por correo. Escríbenos a
          <strong>${SUPPORT_MAIL}</strong> y te guiamos.
        </p>
        <button type="button" class="btn btn-ghost btn-block" id="subscribe-pro-dev" style="margin-top:8px" hidden>
          Activar Pro (solo desarrollo, sin pago)
        </button>`
      : `
        <div class="subscribe-pro-modal__plans" role="group" aria-label="Elegir modalidad de pago">
          <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="subscribe-pro-btn" data-plan="monthly">
            Mensual — ${formatSubscriptionPriceCLP(SUBSCRIPTION_PRICE_CLP)}/mes
          </button>
          <button type="button" class="btn btn-secondary btn-block subscribe-pro-modal__cta" id="subscribe-pro-annual-btn" data-plan="annual">
            Anual — ${formatSubscriptionPriceCLP(SUBSCRIPTION_ANNUAL_PRICE_CLP)}/año
          </button>
        </div>
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
          Pago seguro con Mercado Pago. Elige cobro mensual o anual; puedes gestionar o cancelar desde tu cuenta MP.
        </p>`;

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
          En Demo tienes todos los packs clínicos, Neurofeedback en vivo y hasta <strong>${FREE_ACTIVE_PATIENT_LIMIT} pacientes activos</strong> — los archivados, completados o en pausa no ocupan cupo.
          El Plan Profesional desbloquea:
        </p>
        <p class="subscribe-pro-modal__api-status" id="subscribe-pro-api-status" aria-live="polite" ${pro || isUsa ? 'hidden' : ''}>Comprobando servidor de pagos…</p>
        <ul class="subscribe-pro-features">
          ${PRO_FEATURES.map((f) => `<li><span class="subscribe-pro-features__plus">+</span>${f}</li>`).join('')}
        </ul>
        ${ctaBlock}
        <footer class="subscribe-pro-modal__foot">
          <a href="mailto:${SUPPORT_MAIL}" class="subscribe-pro-modal__link" id="subscribe-pro-contact">¿Tienes alguna pregunta? ${SUPPORT_MAIL}</a>
          <button type="button" class="subscribe-pro-modal__link subscribe-pro-modal__link--btn" id="subscribe-pro-help">
            ¿Problemas con la suscripción?
          </button>
        </footer>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  playOverlayOpen(overlay);
  const close = () => {
    void animateAndRemove(overlay);
  };

  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const profile = loadProfile();
  const apiStatus = overlay.querySelector('#subscribe-pro-api-status');

  overlay.querySelector('#subscribe-pro-manage')?.addEventListener('click', () => {
    if (isUsa) {
      openExternalUrl(`mailto:${SUPPORT_MAIL}?subject=Telar%20Plus%20USA`);
    } else {
      openExternalUrl(MP_SUBSCRIPTIONS_URL);
    }
  });

  overlay.querySelector('#subscribe-pro-contact')?.addEventListener('click', (e) => {
    e.preventDefault();
    openExternalUrl(`mailto:${SUPPORT_MAIL}`);
  });

  overlay.querySelector('#subscribe-pro-help')?.addEventListener('click', () => {
    const url = `mailto:${SUPPORT_MAIL}?subject=Suscripción%20Plan%20Profesional`;
    openExternalUrl(url);
  });

  overlay.querySelector('#subscribe-pro-usa')?.addEventListener('click', () => {
    openExternalUrl(`mailto:${SUPPORT_MAIL}?subject=Telar%20Plus%20USA`);
  });

  if (pro) return;
  if (isUsa) {
    overlay.querySelector('#subscribe-pro-dev')?.addEventListener('click', async () => {
      try {
        await activateDevPro();
        close();
        onSubscribed?.();
      } catch (e) {
        if (apiStatus) {
          apiStatus.hidden = false;
          apiStatus.textContent = e?.message || 'No se pudo activar Pro en desarrollo';
          apiStatus.classList.add('subscribe-pro-modal__api-status--err');
        }
      }
    });
    return;
  }

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

  const beginCheckout = async (plan) => {
    const onActivated = () => {
      close();
      onSubscribed?.();
    };
    window.addEventListener('telar:subscription-activated', onActivated, { once: true });
    await tryActivatePro({ onActivated, plan });
    overlay.querySelector('#subscribe-pro-pending')?.removeAttribute('hidden');
    overlay.querySelector('#subscribe-pro-verify')?.removeAttribute('hidden');
  };
  overlay.querySelector('#subscribe-pro-btn')?.addEventListener('click', () => beginCheckout('monthly'));
  overlay.querySelector('#subscribe-pro-annual-btn')?.addEventListener('click', () => beginCheckout('annual'));

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
