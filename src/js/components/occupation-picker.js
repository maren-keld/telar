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
    const gap = 4;
    const maxH = 220;
    let top = r.bottom + gap;
    if (top + maxH > window.innerHeight - 8) {
      top = Math.max(8, r.top - maxH - gap);
    }
    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${r.left}px`;
    menuEl.style.width = `${r.width}px`;
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
