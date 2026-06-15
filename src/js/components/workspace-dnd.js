import { canMoveModule, getModule, moveModuleToPosition } from '../db.js';
import { toast } from '../utils.js';

export function bindWorkspaceModuleDnD(container, { treatmentId, activeModuleId, onNavigate }) {
  const scroll = container.querySelector('#leftsidebar .workspace-sidebar__scroll');
  if (!scroll) return;

  let draggedId = null;

  const clearDropMarks = () => {
    scroll.querySelectorAll('.module-link--drop-before').forEach((el) => {
      el.classList.remove('module-link--drop-before');
    });
    scroll.querySelectorAll('.session-block--drop-target').forEach((el) => {
      el.classList.remove('session-block--drop-target');
    });
  };

  scroll.querySelectorAll('.module-link').forEach((link) => {
    if (link.dataset.draggable !== 'true') {
      link.draggable = false;
      return;
    }

    link.draggable = true;
    link.title = link.title || 'Arrastrar para reordenar o mover de sesión';

    link.addEventListener('dragstart', (e) => {
      draggedId = link.dataset.moduleId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
      link.classList.add('module-link--dragging');
    });

    link.addEventListener('dragend', () => {
      link.classList.remove('module-link--dragging');
      draggedId = null;
      clearDropMarks();
    });

    link.addEventListener('dragover', (e) => {
      if (!draggedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      if (draggedId !== link.dataset.moduleId) {
        link.classList.add('module-link--drop-before');
      }
    });

    link.addEventListener('dragleave', () => {
      link.classList.remove('module-link--drop-before');
    });

    link.addEventListener('drop', async (e) => {
      e.preventDefault();
      clearDropMarks();
      const fromId = draggedId || e.dataTransfer.getData('text/plain');
      if (!fromId || fromId === link.dataset.moduleId) return;

      const targetSessionId = Number(link.dataset.sessionId);
      const nav = link.closest('.session-block__modules');
      const links = [...nav.querySelectorAll('.module-link')];
      const insertIndex = links.findIndex((l) => l.dataset.moduleId === link.dataset.moduleId);
      await finishMove(fromId, targetSessionId, insertIndex);
    });
  });

  scroll.querySelectorAll('.session-block').forEach((block) => {
    const nav = block.querySelector('.session-block__modules');
    const sessionId = Number(block.dataset.sessionId);

    block.addEventListener('dragover', (e) => {
      if (!draggedId) return;
      const overLink = e.target.closest('.module-link');
      if (overLink && overLink.closest('.session-block') === block) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      block.classList.add('session-block--drop-target');
    });

    block.addEventListener('dragleave', (e) => {
      if (!block.contains(e.relatedTarget)) {
        block.classList.remove('session-block--drop-target');
      }
    });

    nav?.addEventListener('dragover', (e) => {
      if (!draggedId) return;
      if (e.target.closest('.module-link')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      block.classList.add('session-block--drop-target');
    });

    const dropAtEnd = async (e) => {
      e.preventDefault();
      clearDropMarks();
      const fromId = draggedId || e.dataTransfer.getData('text/plain');
      if (!fromId) return;
      const links = nav ? [...nav.querySelectorAll('.module-link')] : [];
      const insertIndex = links.length;
      const fromLink = scroll.querySelector(`.module-link[data-module-id="${fromId}"]`);
      if (fromLink?.dataset.sessionId === String(sessionId) && insertIndex > 0) {
        const currentIdx = links.findIndex((l) => l.dataset.moduleId === fromId);
        if (currentIdx >= 0 && currentIdx === insertIndex - 1) return;
      }
      await finishMove(fromId, sessionId, insertIndex);
    };

    block.addEventListener('drop', dropAtEnd);
    nav?.addEventListener('drop', dropAtEnd);
  });

  async function finishMove(moduleId, targetSessionId, insertIndex) {
    try {
      const mod = await getModule(moduleId);
      if (!mod || !canMoveModule(mod)) {
        toast('Este módulo no se puede mover.');
        return;
      }
      const fromLink = scroll.querySelector(`.module-link[data-module-id="${moduleId}"]`);
      if (fromLink && String(mod.session_id) === String(targetSessionId)) {
        const nav = fromLink.closest('.session-block__modules');
        const links = nav ? [...nav.querySelectorAll('.module-link')] : [];
        const fromIdx = links.findIndex((l) => l.dataset.moduleId === String(moduleId));
        if (fromIdx >= 0 && fromIdx < insertIndex) insertIndex -= 1;
      }
      await moveModuleToPosition(moduleId, targetSessionId, insertIndex);
      const keepActive =
        activeModuleId && String(activeModuleId) === String(moduleId) ? moduleId : activeModuleId;
      onNavigate({
        view: 'workspace',
        treatmentId,
        sessionId: targetSessionId,
        moduleId: keepActive,
      });
    } catch (err) {
      toast(err.message || 'No se pudo mover el módulo');
    }
  }
}
