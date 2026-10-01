import { CLINIC_COUNTRIES, isValidClinicCountry, localizedClinicCountryLabel } from '../clinic-country.js';
import { loadProfile, saveProfile } from '../profile.js';
import { escapeHtml, toast } from '../utils.js';
import { getLocale, setLocale, t } from '../i18n.js';
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
export function openPractitionerOnboardingModal({ onDone, draft = {} } = {}) {
  if (!needsPractitionerOnboarding()) {
    onDone?.();
    return;
  }

  const profile = { ...loadProfile(), ...draft };
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop subscribe-pro-overlay';
  overlay.dataset.modalNoEsc = '1';
  overlay.innerHTML = `
    <div class="subscribe-pro-modal practitioner-onboarding" role="dialog" aria-labelledby="onboard-title">
      <aside class="subscribe-pro-modal__brand">
        <span class="subscribe-pro-modal__brand-name">Telar</span>
        <span class="subscribe-pro-modal__brand-tag">${escapeHtml(t('onboarding.profile'))}</span>
      </aside>
      <div class="subscribe-pro-modal__content">
        <header class="subscribe-pro-modal__head">
          <h2 id="onboard-title">${escapeHtml(t('onboarding.welcome'))}</h2>
        </header>
        <p class="subscribe-pro-modal__intro">
          ${escapeHtml(t('onboarding.intro'))}
        </p>
        <div class="practitioner-onboarding__form">
          <div class="form-group">
            <label for="onboard-language">${escapeHtml(t('settings.language'))}</label>
            <select id="onboard-language">
              <option value="es" ${getLocale() === 'es' ? 'selected' : ''}>Español</option>
              <option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option>
            </select>
          </div>
          <div class="form-group">
            <label for="onboard-name">${escapeHtml(t('settings.name'))}</label>
            <input type="text" id="onboard-name" autocomplete="name"
              value="${escapeHtml(profile.name || '')}" placeholder="${escapeHtml(t('onboarding.professionalName'))}" />
          </div>
          <div class="form-group">
            <label for="onboard-email">${escapeHtml(t('settings.email'))}</label>
            <input type="email" id="onboard-email" autocomplete="email"
              value="${escapeHtml(profile.email || '')}" placeholder="${escapeHtml(t('onboarding.emailPlaceholder'))}" />
          </div>
          <div class="form-group">
            <label for="onboard-country">${escapeHtml(t('onboarding.country'))}</label>
            <select id="onboard-country">
              <option value="">${escapeHtml(t('onboarding.select'))}</option>
              ${CLINIC_COUNTRIES.map((c) => {
                const selected = String(profile.clinicCountry || '').toUpperCase() === c.id ? ' selected' : '';
                return `<option value="${escapeHtml(c.id)}"${selected}>${escapeHtml(localizedClinicCountryLabel(c.id, getLocale()))}</option>`;
              }).join('')}
            </select>
          </div>
          <p class="practitioner-onboarding__hint" id="onboard-hint" aria-live="polite"></p>
          <button type="button" class="btn btn-primary btn-block subscribe-pro-modal__cta" id="onboard-save">
            ${escapeHtml(t('onboarding.continue'))}
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
  overlay.querySelector('#onboard-language')?.addEventListener('change', (event) => {
    const nextDraft = { name: nameInput?.value || '', email: emailInput?.value || '', clinicCountry: countrySelect?.value || '' };
    setLocale(event.target.value);
    overlay.remove();
    openPractitionerOnboardingModal({ onDone, draft: nextDraft });
  });

  overlay.querySelector('#onboard-save')?.addEventListener('click', () => {
    const name = nameInput?.value?.trim() || '';
    const email = emailInput?.value?.trim().toLowerCase() || '';
    const clinicCountry = String(countrySelect?.value || '').toUpperCase();
    if (!name) {
      hint.textContent = t('onboarding.nameRequired');
      shakeEl(nameInput);
      nameInput?.focus();
      return;
    }
    if (!isValidEmail(email)) {
      hint.textContent = t('onboarding.emailRequired');
      shakeEl(emailInput);
      emailInput?.focus();
      return;
    }
    if (!isValidClinicCountry(clinicCountry)) {
      hint.textContent = t('onboarding.countryRequired');
      shakeEl(countrySelect);
      countrySelect?.focus();
      return;
    }
    saveProfile({ name, email, clinicCountry, onboardingComplete: true });
    toast(t('onboarding.saved'));
    void animateAndRemove(overlay);
    onDone?.();
  });
}
