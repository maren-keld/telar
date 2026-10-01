import { nominatimCountryCode } from '../clinic-country.js';
import { suggestCities } from '../city-suggestions.js';
import { escapeHtml } from '../utils.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 350;

async function fetchNominatim(query, countryCode) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    limit: '8',
    featureType: 'settlement',
    'accept-language': 'es',
  });
  if (countryCode) params.set('countrycodes', countryCode);
  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return (rows || [])
      .filter((row) => !countryCode || row.address?.country_code?.toLowerCase() === countryCode)
      .map((r) => r.display_name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Autocompletado de localidades por país (Nominatim/OSM + sugerencias sin conexión).
 *  El dropdown se monta como portal en <body> con position:fixed para evitar que
 *  cualquier overflow:hidden de los ancestros lo recorte. */
export function bindAddressAutocomplete(input, { onSelect, country } = {}) {
  if (!input || input.dataset.addressAutocomplete) return;
  input.dataset.addressAutocomplete = '1';
  input.setAttribute('autocomplete', 'off');
  const countryCode = nominatimCountryCode(country);

  // Portal al body para que no quede recortado por overflow:hidden
  const list = document.createElement('ul');
  list.className = 'address-autocomplete__list address-autocomplete__list--portal';
  list.hidden = true;
  document.body.appendChild(list);

  let items = [];
  let timer = null;
  let reqId = 0;
  let suppressSuggest = false;

  const positionList = () => {
    const rect = input.getBoundingClientRect();
    list.style.top = `${rect.bottom + 4}px`;
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
  };

  const hide = () => {
    clearTimeout(timer);
    reqId += 1;
    list.hidden = true;
  };

  const render = async () => {
    if (suppressSuggest || !input.isConnected || document.activeElement !== input) return;
    const q = input.value.trim();
    const local = suggestCities(q, countryCode);
    const id = ++reqId;
    let remote = [];
    if (q.length >= 3) {
      remote = await fetchNominatim(q, countryCode);
    }
    if (id !== reqId || suppressSuggest || document.activeElement !== input || !input.isConnected) return;

    const seen = new Set();
    items = [];
    for (const label of [...local, ...remote]) {
      if (seen.has(label)) continue;
      seen.add(label);
      items.push(label);
      if (items.length >= 8) break;
    }

    if (!items.length) {
      hide();
      return;
    }
    list.innerHTML = items
      .map(
        (label, i) =>
          `<li><button type="button" class="address-autocomplete__item" data-idx="${i}">${escapeHtml(label)}</button></li>`,
      )
      .join('');
    positionList();
    list.hidden = false;
  };

  const schedule = () => {
    if (suppressSuggest) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      render();
    }, DEBOUNCE_MS);
  };

  input.addEventListener('input', () => {
    suppressSuggest = false;
    schedule();
  });
  input.addEventListener('focus', () => {
    if (suppressSuggest) return;
    schedule();
  });

  list.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-idx]');
    if (!btn) return;
    e.preventDefault();
    clearTimeout(timer);
    reqId += 1;
    suppressSuggest = true;
    input.value = items[Number(btn.dataset.idx)] || '';
    hide();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onSelect?.();
    input.blur();
  });

  input.addEventListener('blur', () => {
    hide();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  // Limpiar el portal cuando el input se elimina del DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(input)) {
      hide();
      list.remove();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
