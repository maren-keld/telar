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
