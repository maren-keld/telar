import { suggestAddresses } from '../chile-map.js';
import { escapeHtml } from '../utils.js';

/** Autocompletado local de direcciones chilenas (sin APIs externas). */
export function bindAddressAutocomplete(input, { onSelect } = {}) {
  if (!input || input.dataset.addressAutocomplete) return;
  input.dataset.addressAutocomplete = '1';
  input.setAttribute('autocomplete', 'off');

  const wrap = document.createElement('div');
  wrap.className = 'address-autocomplete';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement('ul');
  list.className = 'address-autocomplete__list';
  list.hidden = true;
  wrap.appendChild(list);

  let items = [];

  const hide = () => {
    list.hidden = true;
  };

  const render = () => {
    items = suggestAddresses(input.value);
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
    list.hidden = false;
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);

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
}
