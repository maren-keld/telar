import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSystemLocale, getLocale, initLocaleFromProfile, setLocale, t, tf } from '../../src/js/i18n.js';
import { loadProfile } from '../../src/js/profile.js';
import { localizedClinicCountryLabel } from '../../src/js/clinic-country.js';
import { resolveQuestionnaireDef } from '../../src/js/custom-modules.js';

function environment(languages, stored) {
  const originals = new Map(['localStorage', 'navigator', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map(stored ? [['telar.practitioner', JSON.stringify(stored)]] : []);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages, language: languages[0] } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: '' } } });
  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

test('la primera apertura detecta inglés antes del onboarding y persiste la preferencia', () => {
  const restore = environment(['en-US', 'es-CL']);
  try {
    assert.equal(loadProfile().locale, '');
    initLocaleFromProfile();
    assert.equal(getLocale(), 'en');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(loadProfile().locale, 'en');
    assert.equal(t('onboarding.welcome'), 'Welcome to Telar');
    assert.equal(tf('unlock.updateVersion', { version: '1.2.3' }), 'Update 1.2.3 available');
    assert.equal(localizedClinicCountryLabel('US', 'en'), 'United States');
    assert.equal(localizedClinicCountryLabel('OTRO', 'en'), 'Other');
  } finally { restore(); }
});

test('el idioma elegido tiene prioridad sobre el sistema y conserva el perfil', () => {
  const restore = environment(['en-US'], { locale: 'es', name: 'Ana', clinicCountry: 'US' });
  try {
    initLocaleFromProfile();
    assert.equal(getLocale(), 'es');
    setLocale('en');
    assert.equal(loadProfile().name, 'Ana');
    assert.equal(loadProfile().clinicCountry, 'US');
    assert.equal(t('onboarding.nameRequired'), 'Enter your name.');
  } finally { restore(); }
});

test('detecta variantes regionales y el primer idioma compatible', () => {
  for (const [languages, expected] of [[['es-MX', 'en-US'], 'es'], [['fr-CA', 'en-CA'], 'en'], [['en_GB'], 'en'], [['ja-JP'], 'es']]) {
    const restore = environment(languages);
    try { assert.equal(detectSystemLocale(), expected); } finally { restore(); }
  }
});

test('los cuestionarios bilingües usan la definición del autor en el idioma seleccionado', () => {
  const es = { schema: 1, title: 'Escala', items: [{ index: 0, text: 'Pregunta' }] };
  const en = { schema: 1, title: 'Scale', items: [{ index: 0, text: 'Question' }] };
  const mod = { def: es, defs: { es, en } };
  assert.equal(resolveQuestionnaireDef(mod, 'en'), en);
  assert.equal(resolveQuestionnaireDef(mod, 'es'), es);
  assert.equal(resolveQuestionnaireDef({ def: es }, 'en'), es);
});
