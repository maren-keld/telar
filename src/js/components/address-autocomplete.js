import { suggestAddresses } from '../chile-map.js';
import { escapeHtml } from '../utils.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 350;

async function fetchNominatim(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    countrycodes: 'cl',
    limit: '8',
  });
  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return (rows || []).map((r) => r.display_name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Autocompletado de direcciones (Nominatim/OSM en Chile + comunas locales offline).
 *  El dropdown se monta como portal en <body> con position:fixed para evitar que
 *  cualquier overflow:hidden de los ancestros lo recorte. */
export function bindAddressAutocomplete(input, { onSelect } = {}) {
  if (!input || input.dataset.addressAutocomplete) return;
  input.dataset.addressAutocomplete = '1';
  input.setAttribute('autocomplete', 'off');

  // Portal al body para que no quede recortado por overflow:hidden
  const list = document.createElement('ul');
  list.className = 'address-autocomplete__list address-autocomplete__list--portal';
  list.hidden = true;
  document.body.appendChild(list);

  let items = [];
  let timer = null;
  let reqId = 0;

  const positionList = () => {
    const rect = input.getBoundingClientRect();
    list.style.top = `${rect.bottom + 4}px`;
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
  };

  const hide = () => {
    list.hidden = true;
  };

  const render = async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      hide();
      return;
    }

    const local = suggestAddresses(q);
    const id = ++reqId;
    let remote = [];
    if (q.length >= 3) {
      remote = await fetchNominatim(q);
    }
    if (id !== reqId) return;

    const seen = new Set();
    items = [];
    for (const label of [...remote, ...local]) {
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
    clearTimeout(timer);
    timer = setTimeout(() => {
      render();
    }, DEBOUNCE_MS);
  };

  input.addEventListener('input', schedule);
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) schedule();
  });

  list.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-idx]');
    if (!btn) return;
    e.preventDefault();
    input.value = items[Number(btn.dataset.idx)] || '';
    hide();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onSelect?.();
  });

  input.addEventListener('blur', () => {
    setTimeout(hide, 120);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  // Limpiar el portal cuando el input se elimina del DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(input)) {
      list.remove();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
