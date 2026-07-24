import { loadProfile, saveProfile } from '../profile.js';
import { escapeHtml, toast } from '../utils.js';

function isValidEmail(raw) {
  const email = String(raw || '').trim();
  return email.includes('@') && email.includes('.');
}

/** Falta nombre o email del profesional (requeridos para suscripción y plan Pro). */
export function needsPractitionerOnboarding() {
  const profile = loadProfile();
  return !profile.name?.trim() || !profile.email?.trim();
}

/**
 * Onboarding suave una sola vez: nombre + email obligatorios.
 * No se puede cerrar sin completar (excepto si ya tiene ambos).
 */
export function openPractitionerOnboardingModal({ onDone } = {}) {
  if (!needsPractitionerOnboarding()) {
    onDone?.();
    return;
  }

  const profile = loadProfile();
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop subscribe-pro-overlay';
  overlay.innerHTML = `
    <div class="subscribe-pro-modal practitioner-onboarding" role="dialog" aria-labelledby="onboard-title">
      <aside class="subscribe-pro-modal__brand">
        <span class="subscribe-pro-modal__brand-name">Telar</span>
        <span class="subscribe-pro-modal__brand-tag">Tu perfil</span>
      </aside>
      <div class="subscribe-pro-modal__content">
        <header class="subscribe-pro-modal__head">
          <h2 id="onboard-title">Bienvenido a Telar</h2>
        </header>
        <p class="subscribe-pro-modal__intro">
          Antes de empezar, cuéntanos quién eres. El <strong>email</strong> se usa para el plan Pro y Mercado Pago.
        </p>
        <label class="input-label" for="onboard-name">Nombre</label>
        <input type="text" class="input" id="onboard-name" autocomplete="name"
          value="${escapeHtml(profile.name || '')}" placeholder="Tu nombre profesional" />
        <label class="input-label" for="onboard-email" style="margin-top:12px">Correo electrónico</label>
        <input type="email" class="input" id="onboard-email" autocomplete="email"
          value="${escapeHtml(profile.email || '')}" placeholder="tu@email.com" />
        <p class="subscribe-pro-modal__fine" id="onboard-hint" style="margin-top:8px"></p>
        <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="onboard-save" style="margin-top:16px">
          Continuar
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#onboard-name');
  const emailInput = overlay.querySelector('#onboard-email');
  const hint = overlay.querySelector('#onboard-hint');
  nameInput?.focus();

  overlay.querySelector('#onboard-save')?.addEventListener('click', () => {
    const name = nameInput?.value?.trim() || '';
    const email = emailInput?.value?.trim().toLowerCase() || '';
    if (!name) {
      hint.textContent = 'Ingresa tu nombre.';
      nameInput?.focus();
      return;
    }
    if (!isValidEmail(email)) {
      hint.textContent = 'Ingresa un email válido (obligatorio).';
      emailInput?.focus();
      return;
    }
    saveProfile({ name, email, onboardingComplete: true });
    toast('Perfil guardado');
    overlay.remove();
    onDone?.();
  });
}
