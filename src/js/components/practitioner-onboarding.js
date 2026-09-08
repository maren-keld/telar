import { CLINIC_COUNTRIES, isValidClinicCountry } from '../clinic-country.js';
import { loadProfile, saveProfile } from '../profile.js';
import { escapeHtml, toast } from '../utils.js';
import { playOverlayOpen, animateAndRemove, shakeEl } from '../transitions.js';

function isValidEmail(raw) {
  const email = String(raw || '').trim();
  return email.includes('@') && email.includes('.');
}

/** Falta nombre, email o país del profesional. */
export function needsPractitionerOnboarding() {
  const profile = loadProfile();
  return !profile.name?.trim() || !profile.email?.trim() || !isValidClinicCountry(profile.clinicCountry);
}

/**
 * Onboarding suave: nombre, email y país. No se puede cerrar sin completar.
 */
export function openPractitionerOnboardingModal({ onDone } = {}) {
  if (!needsPractitionerOnboarding()) {
    onDone?.();
    return;
  }

  const profile = loadProfile();
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop subscribe-pro-overlay';
  overlay.dataset.modalNoEsc = '1';
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
          Antes de empezar, cuéntanos quién eres y <strong>en qué país atiendes</strong>.
          El email se usa para el plan Pro y Mercado Pago; el país adapta previsión, documento de identidad y ciudad.
        </p>
        <div class="practitioner-onboarding__form">
          <div class="form-group">
            <label for="onboard-name">Nombre</label>
            <input type="text" id="onboard-name" autocomplete="name"
              value="${escapeHtml(profile.name || '')}" placeholder="Tu nombre profesional" />
          </div>
          <div class="form-group">
            <label for="onboard-email">Correo electrónico</label>
            <input type="email" id="onboard-email" autocomplete="email"
              value="${escapeHtml(profile.email || '')}" placeholder="tu@email.com" />
          </div>
          <div class="form-group">
            <label for="onboard-country">País donde atiendes</label>
            <select id="onboard-country">
              <option value="">Seleccionar…</option>
              ${CLINIC_COUNTRIES.map((c) => {
                const selected = String(profile.clinicCountry || '').toUpperCase() === c.id ? ' selected' : '';
                return `<option value="${escapeHtml(c.id)}"${selected}>${escapeHtml(c.label)}</option>`;
              }).join('')}
            </select>
          </div>
          <p class="practitioner-onboarding__hint" id="onboard-hint" aria-live="polite"></p>
          <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="onboard-save">
            Continuar
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  playOverlayOpen(overlay);

  const nameInput = overlay.querySelector('#onboard-name');
  const emailInput = overlay.querySelector('#onboard-email');
  const countrySelect = overlay.querySelector('#onboard-country');
  const hint = overlay.querySelector('#onboard-hint');
  nameInput?.focus();

  overlay.querySelector('#onboard-save')?.addEventListener('click', () => {
    const name = nameInput?.value?.trim() || '';
    const email = emailInput?.value?.trim().toLowerCase() || '';
    const clinicCountry = String(countrySelect?.value || '').toUpperCase();
    if (!name) {
      hint.textContent = 'Ingresa tu nombre.';
      shakeEl(nameInput);
      nameInput?.focus();
      return;
    }
    if (!isValidEmail(email)) {
      hint.textContent = 'Ingresa un email válido (obligatorio).';
      shakeEl(emailInput);
      emailInput?.focus();
      return;
    }
    if (!isValidClinicCountry(clinicCountry)) {
      hint.textContent = 'Elige el país donde atiendes.';
      shakeEl(countrySelect);
      countrySelect?.focus();
      return;
    }
    saveProfile({ name, email, clinicCountry, onboardingComplete: true });
    toast('Perfil guardado');
    void animateAndRemove(overlay);
    onDone?.();
  });
}
