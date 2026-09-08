/** Reorder list items by dragging a handle. HTML5 DnD no funciona en WKWebView. */
export function enablePointerSortable(container, itemSelector, handleSelector) {
  if (!container || container.dataset.sortable === '1') return;
  container.dataset.sortable = '1';

  let dragging = null;
  let pointerId = null;

  const stop = () => {
    dragging?.classList.remove('is-dragging');
    dragging = null;
    pointerId = null;
    document.body.classList.remove('is-reordering');
  };

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest(handleSelector);
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(itemSelector);
    if (!item || item.parentElement !== container) return;
    e.preventDefault();
    dragging = item;
    pointerId = e.pointerId;
    item.classList.add('is-dragging');
    document.body.classList.add('is-reordering');
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  container.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = el?.closest(itemSelector);
    if (!over || over === dragging || over.parentElement !== container) return;
    const rect = over.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    container.insertBefore(dragging, before ? over : over.nextSibling);
  });

  container.addEventListener('pointerup', (e) => {
    if (pointerId != null && e.pointerId !== pointerId) return;
    stop();
  });
  container.addEventListener('pointercancel', stop);
}
