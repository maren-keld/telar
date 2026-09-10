export const NOTES_WINDOW_TAIL = 40;

export function visibleNotesWindow(sorted, { showAll = false, tailCount = NOTES_WINDOW_TAIL } = {}) {
  const list = Array.isArray(sorted) ? sorted : [];
  if (showAll || list.length <= tailCount) {
    return { notes: list, hiddenCount: 0 };
  }
  return {
    notes: list.slice(list.length - tailCount),
    hiddenCount: list.length - tailCount,
  };
}

/** Sacar #rightsidebar del DOM pone scrollTop en 0 (WebKit). Guardar antes y restaurar después. */
export function captureNotesScroll(root) {
  return root?.querySelector?.('#notes-list')?.scrollTop ?? 0;
}

export function restoreNotesScroll(root, y) {
  const list = root?.querySelector?.('#notes-list');
  if (!list) return;
  const top = Math.max(0, Number(y) || 0);
  const apply = () => {
    if (list.isConnected === false) return;
    list.scrollTop = top;
  };
  apply();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(apply);
  }
}
