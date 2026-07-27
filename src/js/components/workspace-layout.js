export const WORKSPACE_LEFT_WIDTH_KEY = 'telar.workspace.leftSidebarWidth';
export const WORKSPACE_RIGHT_WIDTH_KEY = 'telar.workspace.rightSidebarWidth';

export const LEFT_WIDTH_DEFAULT = 260;
export const LEFT_FOCUS_WIDTH = 56;
export const LEFT_WIDTH_MIN = LEFT_FOCUS_WIDTH;
export const LEFT_WIDTH_MAX = 260;
export const LEFT_FOCUS_SNAP_THRESHOLD = 160;
export const LEFT_FOCUS_CSS_THRESHOLD = 90;

export const RIGHT_WIDTH_DEFAULT = 320;
export const RIGHT_WIDTH_MIN = 320;
export const RIGHT_WIDTH_MAX = 720;

export const MIN_CENTER_WIDTH = 420;

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function parsePxInt(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function isLeftSidebarFocusMode(leftWidth) {
  return leftWidth <= LEFT_FOCUS_CSS_THRESHOLD;
}

export function snapLeftWidthOnRelease(leftWidth) {
  return leftWidth < LEFT_FOCUS_SNAP_THRESHOLD ? LEFT_FOCUS_WIDTH : leftWidth;
}

export function calculateMaxRightWidth(containerWidth, leftWidth) {
  const maxRightByLayout = containerWidth - leftWidth - MIN_CENTER_WIDTH;
  return Math.max(RIGHT_WIDTH_MIN, Math.min(RIGHT_WIDTH_MAX, maxRightByLayout));
}

export function calculateMaxLeftWidth(containerWidth, rightWidth) {
  const maxLeftByLayout = containerWidth - rightWidth - MIN_CENTER_WIDTH;
  return Math.max(LEFT_WIDTH_MIN, Math.min(LEFT_WIDTH_MAX, maxLeftByLayout));
}

export function constrainWorkspaceSidebarWidths({
  layoutWidth,
  leftWidth,
  rightWidth,
  snapLeft = false,
}) {
  let nextLeft = clamp(leftWidth, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX);
  if (snapLeft) nextLeft = snapLeftWidthOnRelease(nextLeft);
  const nextRight = clamp(
    rightWidth,
    RIGHT_WIDTH_MIN,
    calculateMaxRightWidth(layoutWidth, nextLeft),
  );
  return { leftWidth: nextLeft, rightWidth: nextRight };
}

function applyWorkspaceSidebarWidths({ layoutEl, leftSidebarEl, leftWidth, rightWidth }) {
  layoutEl.style.setProperty('--workspace-left-w', `${leftWidth}px`);
  layoutEl.style.setProperty('--workspace-right-w', `${rightWidth}px`);
  leftSidebarEl.classList.toggle('workspace-sidebar--focus', isLeftSidebarFocusMode(leftWidth));
}

export function initWorkspaceSidebarResizers({ layoutEl, leftSidebarEl, rightSidebarEl }) {
  const leftResizer = layoutEl.querySelector('.workspace-resizer--left');
  const rightResizer = layoutEl.querySelector('.workspace-resizer--right');
  if (!leftResizer || !rightResizer) return;

  // Cargar anchos desde localStorage (con defaults).
  let leftWidth = LEFT_WIDTH_DEFAULT;
  let rightWidth = RIGHT_WIDTH_DEFAULT;
  try {
    leftWidth = parsePxInt(localStorage.getItem(WORKSPACE_LEFT_WIDTH_KEY)) ?? LEFT_WIDTH_DEFAULT;
    rightWidth = parsePxInt(localStorage.getItem(WORKSPACE_RIGHT_WIDTH_KEY)) ?? RIGHT_WIDTH_DEFAULT;
  } catch {
    // ignore
  }

  const layoutWidth = layoutEl.getBoundingClientRect().width || window.innerWidth;
  ({ leftWidth, rightWidth } = constrainWorkspaceSidebarWidths({
    layoutWidth,
    leftWidth,
    rightWidth,
    snapLeft: true,
  }));

  applyWorkspaceSidebarWidths({ layoutEl, leftSidebarEl, leftWidth, rightWidth });

  const persist = (nextLeft, nextRight) => {
    try {
      localStorage.setItem(WORKSPACE_LEFT_WIDTH_KEY, String(Math.round(nextLeft)));
      localStorage.setItem(WORKSPACE_RIGHT_WIDTH_KEY, String(Math.round(nextRight)));
    } catch {
      // ignore
    }
  };

  const setWidthsDuringDrag = (nextLeft, nextRight) => {
    leftWidth = nextLeft;
    rightWidth = nextRight;
    applyWorkspaceSidebarWidths({ layoutEl, leftSidebarEl, leftWidth, rightWidth });
  };

  const startResize = (e, side) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;
    const layoutRect = layoutEl.getBoundingClientRect();
    const containerWidth = layoutRect.width || window.innerWidth;

    // Evita selección de texto y flicker.
    const body = document.body;
    const prevUserSelect = body.style.userSelect;
    body.style.userSelect = 'none';
    body.style.cursor = 'col-resize';
    layoutEl.classList.add('workspace-layout--resizing');

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - startX;

      if (side === 'left') {
        const maxLeft = calculateMaxLeftWidth(containerWidth, startRight);
        const nextLeft = clamp(startLeft + dx, LEFT_WIDTH_MIN, maxLeft);
        const maxRight = calculateMaxRightWidth(containerWidth, nextLeft);
        const nextRight = clamp(startRight, RIGHT_WIDTH_MIN, maxRight);
        setWidthsDuringDrag(nextLeft, nextRight);
      } else {
        // Derecha: drag izquierda (dx<0) = panel crece, drag derecha (dx>0) = panel achica
        const maxRight = calculateMaxRightWidth(containerWidth, startLeft);
        const nextRight = clamp(startRight - dx, RIGHT_WIDTH_MIN, maxRight);
        setWidthsDuringDrag(startLeft, nextRight);
      }
    };

    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      body.style.userSelect = prevUserSelect;
      body.style.cursor = '';
      layoutEl.classList.remove('workspace-layout--resizing');

      if (side === 'left') {
        const snappedLeft = snapLeftWidthOnRelease(leftWidth);
        if (snappedLeft !== leftWidth) {
          setWidthsDuringDrag(snappedLeft, rightWidth);
        }
      }

      persist(leftWidth, rightWidth);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
  };

  leftResizer.addEventListener('pointerdown', (e) => startResize(e, 'left'));
  rightResizer.addEventListener('pointerdown', (e) => startResize(e, 'right'));

  const toggleBtn = leftSidebarEl.querySelector('#btn-sidebar-toggle');
  toggleBtn?.addEventListener('click', () => {
    const nextMode = isLeftSidebarFocusMode(leftWidth) ? 'full' : 'focus';
    document.dispatchEvent(new CustomEvent('telar:workspace-mode', { detail: { mode: nextMode } }));
  });

  // Escuchar cambios de modo (Focus / Full) desde patient menu o tools tab.
  if (window._telarWorkspaceModeHandler) {
    document.removeEventListener('telar:workspace-mode', window._telarWorkspaceModeHandler);
  }
  const handleModeChange = (e) => {
    const mode = e.detail?.mode;
    if (mode === 'focus') {
      const snapped = LEFT_FOCUS_WIDTH;
      setWidthsDuringDrag(snapped, rightWidth);
      persist(snapped, rightWidth);
    } else if (mode === 'full') {
      const snapped = LEFT_WIDTH_DEFAULT;
      const layoutW = layoutEl.getBoundingClientRect().width || window.innerWidth;
      const maxR = calculateMaxRightWidth(layoutW, snapped);
      const nextRight = clamp(rightWidth, RIGHT_WIDTH_MIN, maxR);
      setWidthsDuringDrag(snapped, nextRight);
      persist(snapped, nextRight);
    }
  };
  document.addEventListener('telar:workspace-mode', handleModeChange);
  window._telarWorkspaceModeHandler = handleModeChange;

  // Doble click para reset.
  leftResizer.addEventListener('dblclick', () => {
    const layoutWidth = layoutEl.getBoundingClientRect().width || window.innerWidth;
    const nextLeft = LEFT_WIDTH_DEFAULT;
    const maxRight = calculateMaxRightWidth(layoutWidth, nextLeft);
    const nextRight = clamp(RIGHT_WIDTH_DEFAULT, RIGHT_WIDTH_MIN, maxRight);
    setWidthsDuringDrag(nextLeft, nextRight);
    persist(nextLeft, nextRight);
  });

  rightResizer.addEventListener('dblclick', () => {
    const layoutWidth = layoutEl.getBoundingClientRect().width || window.innerWidth;
    const nextRight = RIGHT_WIDTH_DEFAULT;
    const maxLeft = calculateMaxLeftWidth(layoutWidth, nextRight);
    const nextLeft = clamp(leftWidth, LEFT_WIDTH_MIN, maxLeft);
    setWidthsDuringDrag(nextLeft, nextRight);
    persist(nextLeft, nextRight);
  });
}
