/** Glyphs de estado y tags (SVG inline, currentColor). */

const svg = (inner, className = 'status-glyph__svg') =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${inner}</svg>`;

const TAG_CLASS = 'tag-glyph__svg';

/** Asterisco de 8 brazos — enTratamiento.svg */
const EN_TRATAMIENTO_INNER = `<g fill="currentColor" transform="translate(12 12)"><rect x="-1.7" y="-10" width="3.4" height="20" rx="1.7"/><rect x="-10" y="-1.7" width="20" height="3.4" rx="1.7"/><g transform="rotate(45)"><rect x="-1.7" y="-10" width="3.4" height="20" rx="1.7"/><rect x="-10" y="-1.7" width="20" height="3.4" rx="1.7"/></g></g>`;

/** Círculo — enPausa.svg */
const EN_PAUSA_INNER = `<circle cx="12" cy="12" r="7.25" fill="currentColor"/>`;

/** Burbuja de comentario — masEstudio.svg */
const MAS_ESTUDIO_INNER = `<path fill="currentColor" fill-rule="evenodd" d="M12.2 3.1c5 0 8.9 3.5 8.9 7.9 0 4.3-3.9 7.8-8.9 7.8-1.15 0-2.25-.18-3.25-.54l-4.7 2.05c-.55.24-1.14-.3-.95-.86l1.15-3.35C3.4 14.6 3.3 12.7 3.3 11c0-4.4 3.9-7.9 8.9-7.9zm0 2.35c-3.65 0-6.45 2.5-6.45 5.55 0 1.7.25 3.15 1.35 4.25l.28.28-.42 1.85 2.35-1.05.42.12c.75.28 1.55.42 2.47.42 3.65 0 6.45-2.5 6.45-5.55S15.85 5.45 12.2 5.45z"/>`;

/** Dos círculos — supervisado.svg */
const SUPERVISADO_INNER = `<circle cx="6.9" cy="12" r="4.7" fill="currentColor"/><circle cx="17.1" cy="12" r="4.7" fill="currentColor"/>`;

/** Triángulo de alerta — alerta.svg (el color rojo lo pone CSS) */
const ALERTA_INNER = `<path fill="currentColor" d="M12 2.6L1.7 20.35c-.38.68.12 1.55.96 1.55h18.68c.84 0 1.34-.87.96-1.55L12 2.6z"/><path fill="#fff" d="M12.85 8.7h-1.7l.22 6.05h1.26l.22-6.05z"/><circle cx="12" cy="17.35" r="1.05" fill="#fff"/>`;

/** Círculo con check — completado (estático) */
const COMPLETADO_INNER = `<circle cx="12" cy="12" r="8.4" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.15l2.55 2.55L16.25 8.9" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>`;

const ARCHIVADO_INNER = `<path class="status-glyph__mark" d="M3.8 10.8h2.9l.95-1.35h3.4V10.8h3.15v7.35H3.8z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/><circle cx="16.6" cy="12" r="1.85" fill="currentColor"/><circle cx="21.2" cy="12" r="1.85" fill="currentColor"/>`;

const ABANDONADO_INNER = `<path class="status-glyph__mark" d="M4 12h6.2" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><circle cx="14.9" cy="12" r="1.85" fill="currentColor"/><circle cx="20.1" cy="12" r="1.85" fill="currentColor"/>`;

const DERIVADO_INNER = `<path fill="currentColor" d="M14.2 5.2h5.6v5.6h-2.05V8.7l-7.4 7.4-1.45-1.45 7.4-7.4h-2.1V5.2zM4.8 6.4h6.1v2.05H6.85v8.7h8.7v-4.05H17.6v6.1H4.8V6.4z"/>`;

export const STATUS_GLYPH_INNER = {
  en_tratamiento: svg(EN_TRATAMIENTO_INNER),
  en_pausa: svg(EN_PAUSA_INNER),
  completado: svg(COMPLETADO_INNER),
  archivado: svg(ARCHIVADO_INNER),
  abandonado: svg(ABANDONADO_INNER),
};

export const TAG_GLYPHS = {
  masEstudio: svg(MAS_ESTUDIO_INNER, TAG_CLASS),
  supervisado: svg(SUPERVISADO_INNER, TAG_CLASS),
  alerta: svg(ALERTA_INNER, TAG_CLASS),
  derivado: svg(DERIVADO_INNER, TAG_CLASS),
};

export const SVG_FILES = {
  enTratamiento: EN_TRATAMIENTO_INNER,
  enPausa: EN_PAUSA_INNER,
  masEstudio: MAS_ESTUDIO_INNER,
  supervisado: SUPERVISADO_INNER,
  alerta: ALERTA_INNER,
};
