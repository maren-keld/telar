/**
 * Honorario de referencia NF y costo Muse 2 según país del visitante (Geo IP).
 * Valores orientativos de mercado privado; fallback Chile.
 *
 * La detección por IP se hace en un hueco idle y se cachea en sessionStorage:
 * no va en el camino crítico del primer pintado (Lighthouse marcaba ipapi.co
 * a ~1 s en el árbol de dependencias).
 */
const GEO_PRICING = {
  CL: {
    country: 'Chile',
    sessionFee: '$50.000',
    museCost: '$320.000',
  },
  AR: {
    country: 'Argentina',
    sessionFee: '$45.000',
    museCost: '$280.000',
  },
  PE: {
    country: 'Perú',
    sessionFee: 'S/ 180',
    museCost: 'S/ 950',
  },
  BR: {
    country: 'Brasil',
    sessionFee: 'R$ 250',
    museCost: 'R$ 1.400',
  },
  UY: {
    country: 'Uruguay',
    sessionFee: '$U 2.500',
    museCost: '$U 12.000',
  },
  CO: {
    country: 'Colombia',
    sessionFee: '$120.000',
    museCost: '$950.000',
  },
  ES: {
    country: 'España',
    sessionFee: '65 €',
    museCost: '230 €',
  },
  MX: {
    country: 'México',
    sessionFee: '$900',
    museCost: '$4.500',
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

function applyGeoPricing(code) {
  const data = GEO_PRICING[code] || GEO_PRICING[DEFAULT_COUNTRY];

  document.querySelectorAll('[data-geo-session-fee]').forEach((el) => {
    el.textContent = data.sessionFee;
  });

  document.querySelectorAll('[data-geo-country]').forEach((el) => {
    el.textContent = data.country;
  });

  document.querySelectorAll('[data-geo-muse-cost]').forEach((el) => {
    el.textContent = data.museCost;
  });

  document.documentElement.dataset.geoCountry = code;
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
