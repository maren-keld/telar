/**
 * Orbe dither blanco y negro, fondo transparente.
 * Lo usan el chat del editor de módulos y el empty state de la bitácora.
 */
import { mountThinkingOrb } from './thinking-orb.js';
import { escapeHtml } from './utils.js';

export function ditherOrbMarkup({ coreId = '', title = '' } = {}) {
  const idAttr = coreId ? ` id="${escapeHtml(coreId)}"` : '';
  const titleHtml = title ? `<p class="dither-orb-empty__title">${escapeHtml(title)}</p>` : '';
  return `<div class="dither-orb-empty">
    <div class="dither-orb" aria-hidden="true">
      <span class="dither-orb__core"${idAttr}></span>
    </div>
    ${titleHtml}
  </div>`;
}

export function mountDitherOrb(coreEl, { size = 108 } = {}) {
  if (!coreEl) return () => {};
  coreEl.style.setProperty('--orb-color-dark', '#111111');
  coreEl.style.setProperty('--orb-color-light', '#f4f4f4');
  coreEl.style.setProperty('--orb-size', `${size}px`);
  // `composing` es el modo ribbon: un disco de franjas que se desliza
  // de izquierda a derecha detrás de la esfera. `working` es el orbe
  // dither sin ese halo.
  return mountThinkingOrb(coreEl, { state: 'working', size });
}
