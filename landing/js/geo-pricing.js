/**
 * Honorario de referencia NF y costo Muse 2 según país del visitante (Geo IP).
 * Valores orientativos de mercado privado; fallback Chile.
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

function countryFromQuery() {
  const code = new URLSearchParams(window.location.search).get('country');
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return SUPPORTED.has(upper) ? upper : null;
}

async function detectCountryCode() {
  const fromQuery = countryFromQuery();
  if (fromQuery) return fromQuery;

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
  detectCountryCode().then(applyGeoPricing);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGeoPricing);
} else {
  initGeoPricing();
}
