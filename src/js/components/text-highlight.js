import { NOTE_COLORS } from '../config.js';
import { addClinicalNote } from '../db.js';
import { moduleLabelFor } from '../custom-modules.js';
import { loadProfile } from '../profile.js';
import { practitionerInitials, toast } from '../utils.js';

let toolbarEl = null;
let suppressToolbarUntil = 0;
/** @type {{ treatmentId: number, onNoteCreated?: () => Promise<void>, authorInitials: string, pending: object|null, anchorField: HTMLTextAreaElement|null }} */
let state = null;

function isMultilineField(el) {
  return el?.tagName === 'TEXTAREA';
}

function ensureToolbar() {
  if (toolbarEl) return toolbarEl;
  toolbarEl = document.createElement('div');
  toolbarEl.id = 'text-highlight-toolbar';
  toolbarEl.className = 'highlight-toolbar';
  toolbarEl.setAttribute('role', 'toolbar');
  toolbarEl.setAttribute('aria-label', 'Resaltar texto seleccionado');
  toolbarEl.hidden = true;
  toolbarEl.innerHTML = `
    <span class="highlight-toolbar__label" id="highlight-toolbar-label">Resaltar</span>
    <div class="highlight-toolbar__colors" role="radiogroup" aria-labelledby="highlight-toolbar-label"></div>`;
  const colors = toolbarEl.querySelector('.highlight-toolbar__colors');
  NOTE_COLORS.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'highlight-toolbar__dot';
    btn.dataset.color = c.id;
    btn.title = c.label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.setAttribute('aria-label', c.label);
    btn.tabIndex = i === 0 ? 0 : -1;
    btn.style.background = `var(--note-${c.id})`;
    colors.appendChild(btn);
  });

  toolbarEl.addEventListener('mousedown', (e) => e.preventDefault());

  colors.addEventListener('click', async (e) => {
    const dot = e.target.closest('.highlight-toolbar__dot');
    if (!dot || !state?.pending) return;
    e.preventDefault();
    e.stopPropagation();
    const field = state.anchorField;
    const { text, ctx, color } = {
      text: state.pending.text,
      ctx: state.pending.ctx,
      color: dot.dataset.color,
    };
    if (!ctx) return;
    const { treatmentId, authorInitials, onNoteCreated } = state;
    colors.querySelectorAll('.highlight-toolbar__dot').forEach((d) => {
      d.setAttribute('aria-checked', d === dot ? 'true' : 'false');
    });
    dismissToolbar(field);
    await addClinicalNote(treatmentId, {
      kind: 'annotation',
      color,
      content: '',
      quoteText: text,
      sourceLabel: ctx.sourceLabel,
      sessionId: ctx.sessionId,
      moduleId: ctx.moduleId,
      authorInitials,
    });
    toast('Anotación añadida a Notas');
    await onNoteCreated?.();
  });

  colors.addEventListener('keydown', (e) => {
    const dots = [...colors.querySelectorAll('.highlight-toolbar__dot')];
    const idx = dots.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % dots.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + dots.length) % dots.length;
    if (next !== idx) {
      e.preventDefault();
      dots.forEach((d, i) => {
        d.tabIndex = i === next ? 0 : -1;
      });
      dots[next].focus();
    }
    if (e.key === 'Escape') dismissToolbar(state?.anchorField);
  });

  document.body.appendChild(toolbarEl);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toolbarEl && !toolbarEl.hidden) {
      dismissToolbar(state?.anchorField);
    }
  });

  return toolbarEl;
}

function hideToolbar() {
  if (toolbarEl) {
    toolbarEl.hidden = true;
    toolbarEl.setAttribute('inert', '');
    toolbarEl.style.removeProperty('--bubble-left');
    toolbarEl.querySelectorAll('.highlight-toolbar__dot').forEach((dot) => {
      dot.setAttribute('aria-checked', 'false');
      dot.tabIndex = -1;
    });
  }
  if (state) {
    state.pending = null;
    state.anchorField = null;
  }
}

function dismissToolbar(field) {
  suppressToolbarUntil = Date.now() + 1200;
  hideToolbar();
  if (field) {
    try {
      const end = field.selectionEnd ?? field.value.length;
      field.setSelectionRange(end, end);
    } catch {
      /* ignore */
    }
    field.blur();
  }
  if (document.activeElement?.closest?.('.highlight-toolbar')) {
    document.activeElement.blur();
  }
}

function readTextareaSelection(field, root) {
  if (!isMultilineField(field) || !root.contains(field)) return null;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  if (start == null || end == null || start === end) return null;
  const text = field.value.substring(start, end).trim();
  if (!text) return null;
  return { field, text, start, end };
}

function moduleContextFromField(field, root) {
  const card = field.closest('.center-module-card');
  if (!card || !root.contains(card)) return null;
  const sessionNumber = card.dataset.sessionNumber;
  const moduleType = card.dataset.moduleType;
  return {
    sessionId: Number(card.dataset.sessionId),
    moduleId: Number(card.dataset.moduleId),
    sourceLabel: `Sesión ${sessionNumber} · ${moduleLabelFor(moduleType)}`,
  };
}

/** Posición del centro de la selección en viewport (aprox. para textarea). */
function selectionAnchorRect(field, start, end) {
  const style = window.getComputedStyle(field);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 20;
  const textBefore = field.value.substring(0, start);
  const lines = textBefore.split('\n').length - 1;
  const fieldRect = field.getBoundingClientRect();
  const padTop = parseFloat(style.paddingTop) || 0;
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const top = fieldRect.top + padTop + lines * lineHeight + lineHeight * 0.5;
  const left = fieldRect.left + padLeft + Math.min(fieldRect.width * 0.4, 80);
  return { top, left, width: 0, height: lineHeight };
}

function showToolbarForSelection(field, root) {
  const sel = readTextareaSelection(field, root);
  if (!sel) {
    hideToolbar();
    return;
  }
  const ctx = moduleContextFromField(field, root);
  if (!ctx) {
    hideToolbar();
    return;
  }
  state.pending = { ...sel, ctx };
  state.anchorField = field;

  const anchor = selectionAnchorRect(field, sel.start, sel.end);
  const bar = ensureToolbar();
  bar.hidden = false;
  bar.removeAttribute('inert');
  const w = bar.offsetWidth || 180;
  const h = bar.offsetHeight || 72;
  const top = Math.max(8, anchor.top - h - 12);
  const left = Math.min(
    window.innerWidth - w - 12,
    Math.max(12, anchor.left - w / 2),
  );
  bar.style.top = `${top}px`;
  bar.style.left = `${left}px`;
  const arrowLeft = Math.min(w - 20, Math.max(20, anchor.left - left));
  bar.style.setProperty('--bubble-left', `${arrowLeft}px`);
}

export function mountTextHighlight(root, { treatmentId, onNoteCreated }) {
  if (!root) return () => {};

  state = {
    treatmentId,
    onNoteCreated,
    authorInitials: practitionerInitials(loadProfile().name),
    pending: null,
    anchorField: null,
  };

  const onSelectionChange = () => {
    if (Date.now() < suppressToolbarUntil) return;
    const active = document.activeElement;
    if (!isMultilineField(active) || !root.contains(active)) {
      // El active element puede ser un textarea FUERA de root (ej. ai-dock-input).
      // No cerrar la barra si el campo ancla aún mantiene una selección activa.
      if (toolbarEl?.contains(document.activeElement)) return;
      const anchorStillSelected =
        state?.anchorField &&
        root.contains(state.anchorField) &&
        state.anchorField.selectionStart != null &&
        state.anchorField.selectionEnd != null &&
        state.anchorField.selectionStart !== state.anchorField.selectionEnd;
      if (!anchorStillSelected) hideToolbar();
      return;
    }
    requestAnimationFrame(() => showToolbarForSelection(active, root));
  };

  const onMouseUp = (e) => {
    if (Date.now() < suppressToolbarUntil) return;
    const field = e.target.closest('textarea');
    if (!isMultilineField(field) || !root.contains(field)) return;
    requestAnimationFrame(() => showToolbarForSelection(field, root));
  };

  const onDismissPointer = (e) => {
    if (!toolbarEl || toolbarEl.hidden) return;
    if (toolbarEl.contains(e.target)) return;
    dismissToolbar(state?.anchorField);
  };

  root.addEventListener('mouseup', onMouseUp);
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mousedown', onDismissPointer, true);
  document.addEventListener('click', onDismissPointer, true);

  return () => {
    root.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('mousedown', onDismissPointer, true);
    document.removeEventListener('click', onDismissPointer, true);
    toolbarEl?.remove();
    toolbarEl = null;
    state = null;
  };
}
