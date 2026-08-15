import { canMoveModule, getModule, moveModuleToPosition } from '../db.js';
import { toast } from '../utils.js';

/** Píxeles de movimiento antes de considerar que es un arrastre y no un click. */
const DRAG_THRESHOLD = 5;
/** Franja del borde del sidebar que activa el autoscroll durante el arrastre. */
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_STEP = 10;

/**
 * Reordenar módulos en el índice lateral.
 *
 * Usa pointer events en vez de HTML5 drag & drop: dentro del WebView de macOS
 * el arrastre nativo se lo queda el sistema y los eventos `drag*` no llegan de
 * forma fiable, así que el reordenamiento simplemente no ocurría.
 */
export function bindWorkspaceModuleDnD(
  container,
  { treatmentId, activeModuleId, onNavigate, onMoved = null } = {},
) {
  // El workspace se re-renderiza a menudo; sin esto los listeners de document
  // se acumularían en cada remontaje.
  unbindPrevious(container);

  const scroll = container.querySelector('#leftsidebar .workspace-sidebar__scroll');
  if (!scroll) return;

  let drag = null;
  let justDraggedAt = 0;

  const clearMarks = () => {
    scroll
      .querySelectorAll('.module-link--drop-before, .module-link--drop-after')
      .forEach((el) => el.classList.remove('module-link--drop-before', 'module-link--drop-after'));
    scroll
      .querySelectorAll('.session-block--drop-target')
      .forEach((el) => el.classList.remove('session-block--drop-target'));
  };

  const removeGhost = () => {
    drag?.ghost?.remove();
  };

  const restoreOpened = (keepBlock) => {
    for (const block of drag?.opened || []) {
      if (block !== keepBlock) {
        block.classList.add('session-block--collapsed');
        block.querySelector('[data-session-toggle]')?.setAttribute('aria-expanded', 'false');
      }
    }
  };

  const teardown = ({ keepDraggingClass = false } = {}) => {
    if (!drag) return;
    drag.link.classList.remove('module-link--dragging');
    removeGhost();
    clearMarks();
    if (!keepDraggingClass) document.body.classList.remove('is-dragging-module');
    drag = null;
  };

  const openIfCollapsed = (block) => {
    if (!block?.classList.contains('session-block--collapsed')) return;
    block.classList.remove('session-block--collapsed');
    block.querySelector('[data-session-toggle]')?.setAttribute('aria-expanded', 'true');
    drag.opened.add(block);
  };

  /** Resuelve dónde caería el módulo según la posición del puntero. */
  const resolveTarget = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el || !scroll.contains(el)) return null;

    const overLink = el.closest('.module-link');
    const block =
      (overLink && overLink !== drag.link ? overLink.closest('.session-block') : null) ||
      el.closest('.session-block');
    if (!block) return null;

    openIfCollapsed(block);

    const nav = block.querySelector('.session-block__modules');
    if (!nav) return { link: null, after: false, block, insertIndex: 0 };

    const insertIndex = insertIndexFromY(nav, y, drag.link.dataset.moduleId);
    const siblings = visibleModuleLinks(nav, drag.link.dataset.moduleId);
    const beforeLink = siblings[insertIndex] || null;
    const afterLink = insertIndex > 0 ? siblings[insertIndex - 1] : null;
    return {
      link: beforeLink || afterLink,
      after: !beforeLink,
      block,
      insertIndex,
    };
  };

  const paintTarget = (target) => {
    clearMarks();
    if (!target) return;
    if (target.link) {
      target.link.classList.add(
        target.after ? 'module-link--drop-after' : 'module-link--drop-before',
      );
    } else {
      target.block?.classList.add('session-block--drop-target');
    }
  };

  const autoScroll = (y) => {
    const rect = scroll.getBoundingClientRect();
    if (y < rect.top + AUTOSCROLL_EDGE) scroll.scrollTop -= AUTOSCROLL_STEP;
    else if (y > rect.bottom - AUTOSCROLL_EDGE) scroll.scrollTop += AUTOSCROLL_STEP;
  };

  const onPointerMove = (e) => {
    if (!drag) return;

    if (!drag.active) {
      const moved =
        Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > DRAG_THRESHOLD;
      if (!moved) return;
      drag.active = true;
      drag.link.classList.add('module-link--dragging');
      document.body.classList.add('is-dragging-module');

      const ghost = document.createElement('div');
      ghost.className = 'module-drag-ghost';
      ghost.textContent = drag.link.textContent.trim();
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }

    e.preventDefault();
    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY - 10}px)`;
    }
    autoScroll(e.clientY);
    drag.target = resolveTarget(e.clientX, e.clientY);
    paintTarget(drag.target);
  };

  const onPointerUp = async (e) => {
    if (!drag) return;
    const { active, link } = drag;
    const moduleId = link.dataset.moduleId;
    const target = active ? resolveTarget(e.clientX, e.clientY) || drag.target : null;
    restoreOpened(target?.block);
    justDraggedAt = active ? Date.now() : 0;
    teardown({ keepDraggingClass: active });
    // El click sintético posterior al pointerup pega en el título de la sesión
    // y la colapsaba. Soltamos la clase en el siguiente frame.
    if (active) {
      requestAnimationFrame(() => document.body.classList.remove('is-dragging-module'));
    }

    if (!active) return;
    if (!target) return;

    const sessionId = Number(target.block?.dataset.sessionId);
    if (!Number.isFinite(sessionId)) return;

    await finishMove(moduleId, sessionId, target.insertIndex ?? 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && drag) {
      restoreOpened(null);
      teardown();
    }
  };

  scroll.querySelectorAll('.module-link').forEach((link) => {
    link.draggable = false;
    if (link.dataset.draggable !== 'true') return;

    link.title = link.title || 'Arrastrar para reordenar o mover de sesión';
    link.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || drag) return;
      drag = {
        link,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        target: null,
        ghost: null,
        opened: new Set(),
      };
    });
  });

  // Capturamos el click posterior al arrastre para no navegar ni colapsar.
  scroll.addEventListener(
    'click',
    (e) => {
      if (Date.now() - justDraggedAt < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  const onPointerCancel = () => {
    restoreOpened(null);
    teardown();
  };

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('keydown', onKeyDown);

  async function finishMove(moduleId, targetSessionId, insertIndex) {
    try {
      const mod = await getModule(moduleId);
      if (!mod || !canMoveModule(mod)) {
        toast('Este módulo no se puede mover.');
        return;
      }
      await moveModuleToPosition(moduleId, targetSessionId, insertIndex);
      const keepActive =
        activeModuleId && String(activeModuleId) === String(moduleId) ? moduleId : activeModuleId;
      if (onMoved) {
        await onMoved({ sessionId: targetSessionId, moduleId: keepActive });
      } else {
        onNavigate({
          view: 'workspace',
          treatmentId,
          sessionId: targetSessionId,
          moduleId: keepActive,
        });
      }
    } catch (err) {
      toast(err.message || 'No se pudo mover el módulo');
    }
  }

  const unbind = () => {
    restoreOpened(null);
    teardown();
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onKeyDown);
  };
  UNBIND.set(container, unbind);
  return unbind;
}

const UNBIND = new WeakMap();

function unbindPrevious(container) {
  const prev = UNBIND.get(container);
  if (prev) {
    prev();
    UNBIND.delete(container);
  }
}

function visibleModuleLinks(nav, excludeModuleId) {
  return [...nav.querySelectorAll('.module-link')].filter((l) => {
    if (l.dataset.moduleId === String(excludeModuleId)) return false;
    const rect = l.getBoundingClientRect();
    return rect.height > 0;
  });
}

/** Índice de inserción según Y, sobre la lista sin el módulo arrastrado. */
export function insertIndexFromY(nav, y, excludeModuleId) {
  const links = visibleModuleLinks(nav, excludeModuleId);
  for (let i = 0; i < links.length; i++) {
    const rect = links[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return i;
  }
  return links.length;
}
