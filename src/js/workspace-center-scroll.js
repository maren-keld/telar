/** Offset de una tarjeta respecto al borde superior del scroll del centro. */
export function moduleViewportOffset(root, el) {
  if (!root || !el) return null;
  if (typeof root.getBoundingClientRect !== 'function') return null;
  if (typeof el.getBoundingClientRect !== 'function') return null;
  return el.getBoundingClientRect().top - root.getBoundingClientRect().top;
}

/** Deja `el` a la misma distancia del borde superior de `root` que `offset`. */
export function restoreModuleViewportOffset(root, el, offset) {
  if (!root || !el || offset == null || Number.isNaN(Number(offset))) return;
  const current = moduleViewportOffset(root, el);
  if (current == null) return;
  const next = (Number(root.scrollTop) || 0) + (current - Number(offset));
  root.scrollTop = Math.max(0, next);
}

export function snapshotModuleCardHeights(host) {
  const heights = new Map();
  if (!host?.querySelectorAll) return heights;
  host.querySelectorAll('.center-module-card').forEach((card) => {
    const id = card.dataset?.moduleId;
    if (id == null || id === '') return;
    const h = card.getBoundingClientRect?.().height;
    if (h > 0) heights.set(String(id), h);
  });
  return heights;
}

export function centerModuleIdsMatch(host, displaySessions) {
  if (!host?.querySelectorAll) return false;
  const fromDom = [...host.querySelectorAll('.center-module-card')].map((c) =>
    String(c.dataset.moduleId),
  );
  const fromData = (displaySessions || []).flatMap((s) =>
    (s.modules || []).map((m) => String(m.id)),
  );
  if (fromDom.length !== fromData.length) return false;
  return fromDom.every((id, i) => id === fromData[i]);
}
