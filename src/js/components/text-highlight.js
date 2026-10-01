import { NOTE_COLORS } from '../config.js';
import { addClinicalNote, getClinicalNotes } from '../db.js';
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
    toast('Anotación añadida a Bitácora');
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
  const fieldLabel = field.closest('.form-group')?.querySelector('label')?.textContent?.trim() || field.name || field.id;
  return {
    sessionId: Number(card.dataset.sessionId),
    moduleId: Number(card.dataset.moduleId),
    sourceLabel: `Sesión ${sessionNumber} · ${moduleLabelFor(moduleType)}${fieldLabel ? ` · ${fieldLabel}` : ''}`,
  };
}

/** Mirror con la misma tipografía y ancho útil del textarea: respeta wrap y scroll. */
function fieldMirror(field) {
  const style = getComputedStyle(field);
  const rect = field.getBoundingClientRect();
  const frame = document.createElement('div');
  frame.className = 'textarea-highlight-layer';
  frame.setAttribute('aria-hidden', 'true');
  for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textIndent', 'textTransform', 'direction', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius']) {
    frame.style[key] = style[key];
  }
  const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  frame.style.width = `${field.clientWidth + borders}px`;
  frame.style.height = `${rect.height}px`;
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  const content = document.createElement('div');
  content.style.transform = `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`;
  frame.appendChild(content);
  return { frame, content, rect };
}

function selectionAnchorRect(field, start, end) {
  const { frame, content, rect } = fieldMirror(field);
  frame.style.visibility = 'hidden';
  content.append(document.createTextNode(field.value.slice(0, start)));
  const selected = document.createElement('span');
  selected.textContent = field.value.slice(start, end);
  content.append(selected, document.createTextNode(field.value.slice(end) + '\n'));
  document.body.append(frame);
  const range = document.createRange();
  range.selectNodeContents(selected);
  const fragments = [...range.getClientRects()];
  const scroller = field.closest('#workspace-center-scroll')?.getBoundingClientRect();
  const visibleTop = Math.max(0, rect.top, scroller?.top ?? 0);
  const visibleBottom = Math.min(window.innerHeight, rect.bottom, scroller?.bottom ?? window.innerHeight);
  const anchor = fragments.find((part) => part.bottom > visibleTop && part.top < visibleBottom);
  const result = anchor ? { top: anchor.top, bottom: anchor.bottom, left: anchor.left + anchor.width / 2 } : null;
  frame.remove();
  return result;
}

function mountFieldHighlights(root, treatmentId) {
  let annotations = [];
  let disposed = false;
  let scheduled = false;
  let revision = 0;
  const layers = new Map();
  const resize = new ResizeObserver(() => schedule());
  const paint = () => {
    scheduled = false;
    if (disposed) return;
    for (const [field, layer] of layers) {
      if (!root.contains(field)) {
        layer.remove();
        layers.delete(field);
        resize.unobserve(field);
      }
    }
    for (const field of root.querySelectorAll('textarea')) {
      const ctx = moduleContextFromField(field, root);
      if (!ctx) continue;
      const ranges = annotations.filter((note) => String(note.module_id) === String(ctx.moduleId))
        .filter((note) => !note.source_label || note.source_label === ctx.sourceLabel || ctx.sourceLabel.startsWith(`${note.source_label} · `))
        .flatMap((note) => {
          const quote = String(note.quote_text || '');
          const start = quote ? field.value.indexOf(quote) : -1;
          return start < 0 ? [] : [{ start, end: start + quote.length, color: note.color || note.note_type || 'teal' }];
        }).sort((a, b) => a.start - b.start);
      if (!ranges.length) {
        layers.get(field)?.remove();
        layers.delete(field);
        resize.unobserve(field);
        continue;
      }
      const { frame, content, rect } = fieldMirror(field);
      const rootRect = root.getBoundingClientRect();
      const scrollerRect = root.closest('#workspace-center-scroll')?.getBoundingClientRect() || rootRect;
      frame.style.clipPath = `inset(${Math.max(0, scrollerRect.top - rect.top)}px ${Math.max(0, rect.right - scrollerRect.right)}px ${Math.max(0, rect.bottom - scrollerRect.bottom)}px ${Math.max(0, scrollerRect.left - rect.left)}px)`;
      let offset = 0;
      for (const item of ranges) {
        const start = Math.max(offset, item.start);
        if (item.end <= start) continue;
        content.append(document.createTextNode(field.value.slice(offset, start)));
        const mark = document.createElement('mark');
        mark.textContent = field.value.slice(start, item.end);
        const color = NOTE_COLORS.some((entry) => entry.id === item.color) ? item.color : 'teal';
        mark.style.backgroundColor = `var(--note-${color})`;
        content.append(mark);
        offset = item.end;
      }
      content.append(document.createTextNode(field.value.slice(offset) + '\n'));
      layers.get(field)?.remove();
      layers.set(field, frame);
      document.body.append(frame);
      resize.observe(field);
    }
  };
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    requestAnimationFrame(paint);
  };
  const reload = async () => {
    const current = ++revision;
    try {
      const notes = await getClinicalNotes(treatmentId, { kind: 'annotation' });
      if (disposed || current !== revision) return;
      annotations = notes;
      schedule();
    } catch { /* La edición del campo sigue disponible si falla la lectura de notas. */ }
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener('input', schedule);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  document.addEventListener('telar:clinical-notes-changed', reload);
  void reload();
  return () => {
    disposed = true;
    observer.disconnect();
    resize.disconnect();
    root.removeEventListener('input', schedule);
    document.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('telar:clinical-notes-changed', reload);
    layers.forEach((layer) => layer.remove());
  };
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
  if (!anchor) {
    hideToolbar();
    return;
  }
  const bar = ensureToolbar();
  bar.hidden = false;
  bar.removeAttribute('inert');
  const w = bar.offsetWidth || 180;
  const h = bar.offsetHeight || 72;
  const below = anchor.top - h - 12 < 8;
  bar.classList.toggle('highlight-toolbar--below', below);
  const top = Math.min(window.innerHeight - h - 12, Math.max(8, below ? anchor.bottom + 12 : anchor.top - h - 12));
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

  const unmountHighlights = mountFieldHighlights(root, treatmentId);
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
    // El click/mousedown que cierra la selección vive en el textarea: si
    // lo tratamos como “afuera”, la barra aparece un instante y se va.
    const field = e.target.closest?.('textarea');
    if (isMultilineField(field) && root.contains(field)) return;
    dismissToolbar(state?.anchorField);
  };

  const onScroll = () => {
    if (state?.anchorField && toolbarEl && !toolbarEl.hidden) showToolbarForSelection(state.anchorField, root);
  };
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  root.addEventListener('mouseup', onMouseUp);
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mousedown', onDismissPointer, true);

  return () => {
    unmountHighlights();
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    root.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('mousedown', onDismissPointer, true);
    toolbarEl?.remove();
    toolbarEl = null;
    state = null;
  };
}
