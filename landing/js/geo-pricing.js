/**
 * Precio Plan Pro, honorario de referencia NF y costo Muse 2 según país (Geo IP).
 *
 * El monto de fondo del Pro es USD 20/mes. Lo que se muestra es el equivalente
 * local redondeado. Chile mantiene $19.990 CLP (precio publicado).
 * Fallback: Chile. Detección por IP en idle + sessionStorage (no bloquea LCP).
 */
const PLAN_USD_MONTHLY = 20;

const GEO_PRICING = {
  CL: {
    country: 'Chile',
    sessionFee: '$50.000',
    museCost: '$320.000',
    planPrice: '$19.990',
    planPeriod: ' CLP/mes',
    planFull: '$19.990 CLP/mes',
  },
  AR: {
    country: 'Argentina',
    sessionFee: '$45.000',
    museCost: '$280.000',
    planPrice: '$29.990',
    planPeriod: ' ARS/mes',
    planFull: '$29.990 ARS/mes',
  },
  BO: {
    country: 'Bolivia',
    sessionFee: 'Bs 600',
    museCost: 'Bs 3.800',
    planPrice: 'Bs 239',
    planPeriod: '/mes',
    planFull: 'Bs 239/mes',
  },
  CO: {
    country: 'Colombia',
    sessionFee: '$120.000',
    museCost: '$950.000',
    planPrice: '$64.990',
    planPeriod: ' COP/mes',
    planFull: '$64.990 COP/mes',
  },
  CR: {
    country: 'Costa Rica',
    sessionFee: '₡23.000',
    museCost: '₡145.000',
    planPrice: '₡9.090',
    planPeriod: '/mes',
    planFull: '₡9.090/mes',
  },
  CU: {
    country: 'Cuba',
    sessionFee: 'US$ 50',
    museCost: 'US$ 280',
    planPrice: 'US$ 20',
    planPeriod: '/mes',
    planFull: 'US$ 20/mes',
  },
  DO: {
    country: 'República Dominicana',
    sessionFee: 'RD$ 2.900',
    museCost: 'RD$ 18.500',
    planPrice: 'RD$ 1.190',
    planPeriod: '/mes',
    planFull: 'RD$ 1.190/mes',
  },
  EC: {
    country: 'Ecuador',
    sessionFee: 'US$ 50',
    museCost: 'US$ 280',
    planPrice: 'US$ 20',
    planPeriod: '/mes',
    planFull: 'US$ 20/mes',
  },
  SV: {
    country: 'El Salvador',
    sessionFee: 'US$ 50',
    museCost: 'US$ 280',
    planPrice: 'US$ 20',
    planPeriod: '/mes',
    planFull: 'US$ 20/mes',
  },
  GT: {
    country: 'Guatemala',
    sessionFee: 'Q 380',
    museCost: 'Q 2.450',
    planPrice: 'Q 155',
    planPeriod: '/mes',
    planFull: 'Q 155/mes',
  },
  HN: {
    country: 'Honduras',
    sessionFee: 'L 1.350',
    museCost: 'L 8.600',
    planPrice: 'L 539',
    planPeriod: '/mes',
    planFull: 'L 539/mes',
  },
  MX: {
    country: 'México',
    sessionFee: '$900',
    museCost: '$4.500',
    planPrice: '$349',
    planPeriod: ' MXN/mes',
    planFull: '$349 MXN/mes',
  },
  NI: {
    country: 'Nicaragua',
    sessionFee: 'C$ 1.850',
    museCost: 'C$ 11.800',
    planPrice: 'C$ 739',
    planPeriod: '/mes',
    planFull: 'C$ 739/mes',
  },
  PA: {
    country: 'Panamá',
    sessionFee: 'US$ 50',
    museCost: 'US$ 280',
    planPrice: 'US$ 20',
    planPeriod: '/mes',
    planFull: 'US$ 20/mes',
  },
  PY: {
    country: 'Paraguay',
    sessionFee: '₲300.000',
    museCost: '₲1.900.000',
    planPrice: '₲119.000',
    planPeriod: '/mes',
    planFull: '₲119.000/mes',
  },
  PE: {
    country: 'Perú',
    sessionFee: 'S/ 180',
    museCost: 'S/ 950',
    planPrice: 'S/ 69',
    planPeriod: '/mes',
    planFull: 'S/ 69/mes',
  },
  UY: {
    country: 'Uruguay',
    sessionFee: '$U 2.500',
    museCost: '$U 12.000',
    planPrice: '$U 799',
    planPeriod: '/mes',
    planFull: '$U 799/mes',
  },
  VE: {
    country: 'Venezuela',
    sessionFee: 'US$ 50',
    museCost: 'US$ 280',
    planPrice: 'US$ 20',
    planPeriod: '/mes',
    planFull: 'US$ 20/mes',
  },
  ES: {
    country: 'España',
    sessionFee: '65 €',
    museCost: '230 €',
    planPrice: '19 €',
    planPeriod: '/mes',
    planFull: '19 €/mes',
  },
  BR: {
    country: 'Brasil',
    sessionFee: 'R$ 250',
    museCost: 'R$ 1.400',
    planPrice: 'R$ 99',
    planPeriod: '/mes',
    planFull: 'R$ 99/mes',
  },
};

const DEFAULT_COUNTRY = 'CL';
const SUPPORTED = new Set(Object.keys(GEO_PRICING));
const CACHE_KEY = 'telar:geo';

function countryFromQuery() {
  const code = new URLSearchParams(window.location.search).get('country');
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return SUPPORTED.has(upper) ? upper : null;
}

function cachedCountry() {
  try {
    const code = (sessionStorage.getItem(CACHE_KEY) || '').toUpperCase();
    return SUPPORTED.has(code) ? code : null;
  } catch {
    return null;
  }
}

function rememberCountry(code) {
  try {
    sessionStorage.setItem(CACHE_KEY, code);
  } catch {
    /* modo privado: se vuelve a preguntar, no es grave */
  }
}

function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 2500 });
  } else {
    setTimeout(fn, 1200);
  }
}

async function lookupCountryCode() {
  try {
    const res = await fetch('https://ipapi.co/country_code/', {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const code = (await res.text()).trim().toUpperCase();
      if (SUPPORTED.has(code)) return code;
    }
  } catch {
    /* sin red o límite de API → Chile */
  }
  return DEFAULT_COUNTRY;
}

function setText(selector, value) {
  if (value == null) return;
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
}

function applyGeoPricing(code) {
  const data = GEO_PRICING[code] || GEO_PRICING[DEFAULT_COUNTRY];

  setText('[data-geo-session-fee]', data.sessionFee);
  setText('[data-geo-country]', data.country);
  setText('[data-geo-muse-cost]', data.museCost);
  setText('[data-geo-plan-price]', data.planPrice);
  setText('[data-geo-plan-period]', data.planPeriod);
  setText('[data-geo-plan-full]', data.planFull);

  document.documentElement.dataset.geoCountry = code;
  document.documentElement.dataset.planUsd = String(PLAN_USD_MONTHLY);
}

function initGeoPricing() {
  const known = countryFromQuery() || cachedCountry();
  if (known) {
    applyGeoPricing(known);
    if (countryFromQuery()) rememberCountry(known);
    return;
  }

  whenIdle(() => {
    lookupCountryCode().then((code) => {
      rememberCountry(code);
      applyGeoPricing(code);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGeoPricing);
} else {
  initGeoPricing();
}
