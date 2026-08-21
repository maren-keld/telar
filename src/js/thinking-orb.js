/**
 * Orbe de pensamiento (working / listening / …) para el dock de IA.
 *
 * Telar no usa React: vendemos thinking-orbs-universal (derivado MIT de
 * thinking-orbs de Jakub Antalik) y lo montamos sobre un canvas 2D.
 */
import { mountOrb } from '../vendor/thinking-orbs/index.js';

export function mountThinkingOrb(host, { state = 'working', size = 20, paused = false } = {}) {
  if (!host) return () => {};
  host.replaceChildren();
  const handle = mountOrb(host, {
    state,
    size,
    theme: 'auto',
    paused: Boolean(paused),
  });
  return () => {
    try {
      handle.destroy();
    } catch {
      /* ignore */
    }
    host.replaceChildren();
  };
}
