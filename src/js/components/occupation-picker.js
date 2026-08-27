import { escapeHtml } from '../utils.js';

/** Menú flotante de ocupaciones (evita recorte por overflow del módulo). */
export function bindOccupationPicker(host, { options, getSelected, onChange }) {
  const trigger = host.querySelector('#occupation-trigger');
  const summary = host.querySelector('#occupation-summary');
  const menu = host.querySelector('#occupation-menu');
  if (!trigger || !summary || !menu) return;

  let portal = null;

  const updateSummary = () => {
    const selected = getSelected();
    summary.textContent = selected.length ? selected.join(', ') : 'Seleccionar ocupaciones…';
    host.querySelectorAll('.occupation-option input').forEach((cb) => {
      cb.checked = selected.includes(cb.value);
    });
  };

  const closeMenu = () => {
    if (portal) {
      portal.remove();
      portal = null;
    }
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  const positionPortal = () => {
    if (!portal) return;
    const r = trigger.getBoundingClientRect();
    const menuEl = portal.querySelector('.occupation-picker__menu');
    if (!menuEl) return;
    const gap = 4;
    const spaceBelow = Math.max(80, window.innerHeight - r.bottom - 8);
    const maxH = Math.min(220, spaceBelow);
    menuEl.style.position = 'fixed';
    menuEl.style.top = `${r.bottom + gap}px`;
    menuEl.style.left = `${r.left}px`;
    menuEl.style.width = `${r.width}px`;
    menuEl.style.right = 'auto';
    menuEl.style.transform = 'none';
    menuEl.style.maxHeight = `${maxH}px`;
    menuEl.style.overflowY = 'auto';
  };

  const openMenu = () => {
    closeMenu();
    portal = document.createElement('div');
    portal.className = 'occupation-picker-portal';
    portal.innerHTML = `
      <div class="occupation-picker__menu occupation-picker__menu--portal" role="listbox" aria-label="Ocupaciones">
        ${options
          .map(
            (o) =>
              `<label class="occupation-option"><input type="checkbox" value="${escapeHtml(o)}" /> ${escapeHtml(o)}</label>`,
          )
          .join('')}
      </div>`;
    document.body.appendChild(portal);
    const menuEl = portal.querySelector('.occupation-picker__menu');
    menuEl.hidden = false;

    const selected = getSelected();
    menuEl.querySelectorAll('.occupation-option input').forEach((cb) => {
      cb.checked = selected.includes(cb.value);
      cb.addEventListener('change', () => {
        onChange(cb.value, cb.checked);
        updateSummary();
      });
    });

    positionPortal();
    trigger.setAttribute('aria-expanded', 'true');

    const onDoc = (e) => {
      if (e.target.closest('.occupation-picker-portal') || e.target.closest('#occupation-trigger')) return;
      closeMenu();
      document.removeEventListener('click', onDoc);
      window.removeEventListener('resize', positionPortal);
      window.removeEventListener('scroll', positionPortal, true);
    };
    setTimeout(() => document.addEventListener('click', onDoc), 0);
    window.addEventListener('resize', positionPortal);
    window.addEventListener('scroll', positionPortal, true);
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (portal) closeMenu();
    else openMenu();
  });

  updateSummary();
  return { updateSummary, closeMenu };
}
