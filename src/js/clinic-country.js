import { loadProfile } from './profile.js';
import { formatChileanRut } from './utils.js';

const CHILE_PREVISION = [
  'Fonasa',
  'Isapre Colmena',
  'Isapre Consalud',
  'Isapre Cruz Blanca',
  'Isapre Nueva Masvida',
  'Isapre Vida Tres',
  'Isapre Banmédica',
  'Particular',
  'Otro',
];

export const CLINIC_COUNTRIES = [
  { id: 'CL', label: 'Chile' },
  { id: 'AR', label: 'Argentina' },
  { id: 'UY', label: 'Uruguay' },
  { id: 'MX', label: 'México' },
  { id: 'PE', label: 'Perú' },
  { id: 'CO', label: 'Colombia' },
  { id: 'ES', label: 'España' },
  { id: 'OTRO', label: 'Otro' },
];

const COUNTRY_IDS = new Set(CLINIC_COUNTRIES.map((c) => c.id));

export function isValidClinicCountry(code) {
  return COUNTRY_IDS.has(String(code || '').toUpperCase());
}

/** País guardado en el perfil, o '' si todavía no eligió. */
export function storedClinicCountry() {
  return String(loadProfile().clinicCountry || '').toUpperCase();
}

/** País para formatear campos. Si aún no eligió, Chile (producto nació ahí). */
export function clinicCountryCode() {
  const raw = storedClinicCountry();
  return isValidClinicCountry(raw) ? raw : 'CL';
}

export function clinicCountryLabel(code = clinicCountryCode()) {
  return CLINIC_COUNTRIES.find((c) => c.id === code)?.label || 'Chile';
}

const COVERAGE = {
  CL: {
    label: 'Previsión',
    options: CHILE_PREVISION,
    defaultOption: 'Fonasa',
  },
  AR: {
    label: 'Cobertura de salud',
    options: ['Obra social', 'Prepaga', 'PAMI', 'Particular', 'Otro'],
    defaultOption: 'Obra social',
  },
  UY: {
    label: 'Cobertura de salud',
    options: ['ASSE', 'Mutualista', 'Seguro privado', 'Particular', 'Otro'],
    defaultOption: 'Mutualista',
  },
  MX: {
    label: 'Afiliación de salud',
    options: ['IMSS', 'ISSSTE', 'INSABI / IMSS-Bienestar', 'Seguro privado', 'Particular', 'Otro'],
    defaultOption: 'Particular',
  },
  PE: {
    label: 'Seguro de salud',
    options: ['SIS', 'EsSalud', 'EPS / privado', 'Particular', 'Otro'],
    defaultOption: 'EsSalud',
  },
  CO: {
    label: 'Régimen de salud',
    options: ['EPS (contributivo)', 'EPS (subsidiado)', 'Prepagada', 'Particular', 'Otro'],
    defaultOption: 'EPS (contributivo)',
  },
  ES: {
    label: 'Cobertura sanitaria',
    options: ['Seguridad Social', 'Mutua', 'Seguro privado', 'Particular', 'Otro'],
    defaultOption: 'Seguridad Social',
  },
  OTRO: {
    label: 'Cobertura de salud',
    options: ['Público', 'Seguro privado', 'Particular', 'Otro'],
    defaultOption: 'Particular',
  },
};

export function coverageFor(country = clinicCountryCode()) {
  return COVERAGE[country] || COVERAGE.CL;
}

export function coverageLabel(country = clinicCountryCode()) {
  return coverageFor(country).label;
}

export function coverageOptions(storedValue = '', country = clinicCountryCode()) {
  const spec = coverageFor(country);
  const selected = String(storedValue || '').trim() || spec.defaultOption;
  if (spec.options.includes(selected)) return { spec, selected, options: spec.options };
  return { spec, selected, options: [selected, ...spec.options] };
}

const ID_SPEC = {
  CL: {
    label: 'Número de ID (RUT)',
    shortLabel: 'RUT/ID',
    placeholder: '12.345.678-9',
    format: 'rut',
  },
  AR: {
    label: 'Número de ID (DNI)',
    shortLabel: 'DNI',
    placeholder: '12.345.678',
    format: 'dni_dots',
    maxDigits: 8,
  },
  UY: {
    label: 'Número de ID (cédula)',
    shortLabel: 'CI',
    placeholder: '1.234.567-8',
    format: 'ci_uy',
  },
  MX: {
    label: 'CURP o ID',
    shortLabel: 'CURP',
    placeholder: 'AAAA000000HDFXXX00',
    format: 'curp',
  },
  PE: {
    label: 'Número de ID (DNI)',
    shortLabel: 'DNI',
    placeholder: '12345678',
    format: 'dni_pe',
  },
  CO: {
    label: 'Número de ID (cédula)',
    shortLabel: 'Cédula',
    placeholder: '12.345.678',
    format: 'dni_dots',
    maxDigits: 10,
  },
  ES: {
    label: 'Número de ID (DNI / NIE)',
    shortLabel: 'DNI',
    placeholder: '12345678A',
    format: 'dni_es',
  },
  OTRO: {
    label: 'Número de ID',
    shortLabel: 'ID',
    placeholder: 'Documento de identidad',
    format: 'plain',
  },
};

export function idSpecFor(country = clinicCountryCode()) {
  return ID_SPEC[country] || ID_SPEC.OTRO;
}

export function nominatimCountryCode(country = clinicCountryCode()) {
  const map = { CL: 'cl', AR: 'ar', UY: 'uy', MX: 'mx', PE: 'pe', CO: 'co', ES: 'es' };
  return map[country] || '';
}

function thousandDots(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return '';
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatNationalId(value, country = clinicCountryCode()) {
  const spec = idSpecFor(country);
  const raw = String(value || '');
  switch (spec.format) {
    case 'rut':
      return formatChileanRut(raw);
    case 'dni_dots': {
      const max = spec.maxDigits || 8;
      return thousandDots(raw.replace(/\D/g, '').slice(0, max));
    }
    case 'ci_uy': {
      const d = raw.replace(/\D/g, '').slice(0, 8);
      if (!d) return '';
      if (d.length === 1) return d;
      return `${thousandDots(d.slice(0, -1))}-${d.slice(-1)}`;
    }
    case 'dni_pe':
      return raw.replace(/\D/g, '').slice(0, 8);
    case 'curp':
      return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 18);
    case 'dni_es':
      return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 9);
    default:
      return raw.trim().slice(0, 32);
  }
}

function significantIdChars(str, country) {
  const spec = idSpecFor(country);
  if (spec.format === 'rut') return String(str || '').replace(/[^0-9kK]/gi, '');
  if (spec.format === 'curp' || spec.format === 'dni_es' || spec.format === 'plain') {
    return String(str || '').replace(/[^A-Za-z0-9]/g, '');
  }
  return String(str || '').replace(/\D/g, '');
}

function caretFromSignificantIndex(formatted, charIndex, country) {
  if (charIndex <= 0) return 0;
  const formattedSig = significantIdChars(formatted, country);
  if (charIndex >= formattedSig.length) return formatted.length;
  let n = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (significantIdChars(formatted[i], country)) {
      n += 1;
      if (n >= charIndex) return i + 1;
    }
  }
  return formatted.length;
}

export function bindNationalIdInput(input, country = clinicCountryCode()) {
  if (!input) return;
  const apply = () => {
    const caret = input.selectionStart ?? input.value.length;
    const charsBefore = significantIdChars(input.value.slice(0, caret), country).length;
    const formatted = formatNationalId(input.value, country);
    input.value = formatted;
    const next = caretFromSignificantIndex(formatted, charsBefore, country);
    try {
      input.setSelectionRange(next, next);
    } catch {
      /* ignore */
    }
  };
  input.addEventListener('input', apply);
  input.addEventListener('blur', () => {
    input.value = formatNationalId(input.value, country);
  });
}

/** Rótulo de la ficha psicométrica: Validez (Chile), Validez (Argentina), etc. */
export function validityHeading(country = clinicCountryCode()) {
  const code = isValidClinicCountry(country) ? country : 'CL';
  if (code === 'OTRO') return 'Validez (local)';
  return `Validez (${clinicCountryLabel(code)})`;
}

/**
 * Adapta menciones de uso en Chile al país del clínico.
 * No reescribe validaciones publicadas (población/muestra chilena, "Validado en Chile").
 */
export function localizeValidityText(text, country = clinicCountryCode()) {
  const source = String(text || '');
  if (!source) return source;
  const code = isValidClinicCountry(country) ? country : 'CL';
  if (code === 'CL') return source;
  const label = code === 'OTRO' ? 'tu país' : clinicCountryLabel(code);
  const held = [];
  const protectedRe =
    /población chilena|muestra chilena|validaci[oó]n chilena|validado en Chile/gi;
  let out = source.replace(protectedRe, (m) => {
    held.push(m);
    return `\u0000${held.length - 1}\u0000`;
  });
  out = out.replace(/en Chile/gi, (m) => (m.startsWith('E') ? `En ${label}` : `en ${label}`));
  held.forEach((m, i) => {
    out = out.replace(`\u0000${i}\u0000`, m);
  });
  return out;
}
