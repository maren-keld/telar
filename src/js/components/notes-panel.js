import { NOTE_COLORS } from '../config.js';
import {
  addClinicalNote,
  deleteClinicalNote,
  getClinicalNotes,
  getSpaceChecks,
  setSpaceCheck,
  updateClinicalNote,
} from '../db.js';
import { debounce } from '../autobind.js';
import { renderWorkspaceScores } from './workspace-scores.js';
import { getTreatmentModuleTypes } from '../db.js';
import { spaceCheckDescription } from '../space-check-descriptions.js';
import { loadProfile } from '../profile.js';
import { escapeHtml, practitionerInitials } from '../utils.js';

export async function mountNotesPanel(container, treatmentId) {
  let refreshList = async () => {};
  let activeTab = 'notas';
  const profile = loadProfile();
  const defaultInitials = practitionerInitials(profile.name);

  container.innerHTML = `
    <div class="space-tools" data-active-tab="notas">
      <nav class="space-tools__tabs2" role="tablist">
        ${[
          ['notas', 'Notas'],
          ['puntajes', 'Puntajes'],
          ['fortalezas', 'Fortalezas'],
          ['defensas', 'Defensas'],
          ['riesgos', 'Riesgos'],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" class="space-tab2${id === 'notas' ? ' active' : ''}" data-tab="${id}" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span></button>`,
          )
          .join('')}
      </nav>
      <div class="space-tools__content">
        <div class="notes-scroll" id="notes-list"></div>
      </div>
      <div class="space-tools__fab">
        <button type="button" class="btn btn-primary btn-fab" id="btn-add-note" title="Añadir nota clínica">+ Nota</button>
      </div>
      <aside class="ai-dock" aria-label="Asistente IA">
        <div class="ai-dock__input-row">
          <input type="text" class="input ai-dock__input" disabled placeholder="Pregunta a la IA sobre el caso" />
          <button type="button" class="btn btn-primary" disabled>Enviar</button>
        </div>
      </aside>
    </div>`;

  const listEl = container.querySelector('#notes-list');

  refreshList = async () => {
    if (activeTab === 'notas') {
      const all = await getClinicalNotes(treatmentId);
      // Mezclar todo: comments + annotations + futuras respuestas IA (kind='ai')
      const sorted = [...all].sort((a, b) => {
        const as = Number(b.starred) - Number(a.starred);
        if (as) return as;
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
      if (!sorted.length) {
        listEl.innerHTML = `<p class="notes-empty">Pulsa + Nota para añadir un comentario. También puedes seleccionar texto en un módulo para crear una anotación.</p>`;
        return;
      }
      listEl.innerHTML = sorted.map((n) => kindleNoteHtml(n, defaultInitials)).join('');
      bindNoteCards(listEl, refreshList);
      return;
    }

    if (activeTab === 'puntajes') {
      const types = await getTreatmentModuleTypes(treatmentId);
      await renderWorkspaceScores(listEl, treatmentId, types);
      return;
    }

    // checklists por tratamiento
    const defs = defaultsFor(activeTab);
    const existing = await getSpaceChecks(treatmentId, activeTab);
    const map = new Map(existing.map((r) => [r.label, Number(r.checked) === 1]));
    const items = defs.map((label) => ({ label, checked: map.get(label) || false }));
    listEl.innerHTML = `
      <div class="space-checklist">
        ${items
          .map((it) => {
            const desc = spaceCheckDescription(activeTab, it.label);
            return `
          <label class="space-check">
            <input type="checkbox" data-space-check value="${escapeHtml(it.label)}" ${it.checked ? 'checked' : ''}/>
            <span class="space-check__body">
              <span class="space-check__title">${escapeHtml(it.label)}</span>
              ${desc ? `<span class="space-check__desc">${escapeHtml(desc)}</span>` : ''}
            </span>
          </label>`;
          })
          .join('')}
      </div>
    `;

    listEl.querySelectorAll('[data-space-check]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        await setSpaceCheck(treatmentId, activeTab, cb.value, cb.checked);
      });
    });
  };

  container.querySelectorAll('.space-tab2').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeTab = btn.dataset.tab;
      const tools = container.querySelector('.space-tools');
      if (tools) tools.dataset.activeTab = activeTab;
      container.querySelectorAll('.space-tab2').forEach((b) => b.classList.toggle('active', b === btn));
      const fab = container.querySelector('#btn-add-note');
      if (fab) fab.hidden = activeTab !== 'notas';
      await refreshList();
    });
  });

  container.querySelector('#btn-add-note')?.addEventListener('click', async () => {
    const id = await addClinicalNote(treatmentId, {
      kind: 'comment',
      color: 'yellow',
      authorInitials: defaultInitials,
    });
    await refreshList();
    listEl.querySelector(`[data-note-id="${id}"]`)?.focus();
  });

  await refreshList();

  const focusNotasTab = async () => {
    activeTab = 'notas';
    const tools = container.querySelector('.space-tools');
    if (tools) tools.dataset.activeTab = 'notas';
    container.querySelectorAll('.space-tab2').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === 'notas');
    });
    const fab = container.querySelector('#btn-add-note');
    if (fab) fab.hidden = false;
    await refreshList();
  };

  return {
    refresh: refreshList,
    focusNotasTab,
    setTab() {
      return refreshList();
    },
  };
}

function defaultsFor(tab) {
  if (tab === 'fortalezas') {
    return [
      'Adaptabilidad',
      'Asertividad emocional',
      'Autocuidado',
      'Capacidad de estar solo sin aislarse',
      'Capacidad de reparación',
      'Creatividad',
      'Empatía',
      'Flexibilidad cognitiva',
      'Insight',
      'Regulación afectiva',
      'Tolerancia a la frustración',
      'Actividad física',
      'Capacidad de disfrute',
      'Capacidad de pedir ayuda',
      'Estructura diaria / disciplina',
      'Participación en comunidad',
      'Propósito o sentido espiritual',
      'Red de apoyo emocional',
      'Vínculos seguros',
      'Altruismo',
      'Anticipación',
      'Humor',
      'Sublimación',
      'Supresión',
    ];
  }
  if (tab === 'defensas') {
    return [
      'Anticipación',
      'Sublimación',
      'Altruismo',
      'Humor',
      'Supresión',
      'Asertividad emocional',
      'Auto-observación',
      'Función reactiva funcional',
      'Actividad imaginativa',
      'Pseudo-altruismo',
      'Formación reactiva',
      'Desplazamiento',
      'Aislamiento del afecto',
      'Racionalización',
      'Intelectualización',
      'Negación parcial',
      'Represión parcial',
      'Disociación leve',
      'Somatización',
      'Proyección',
      'Identificación proyectiva',
      'Splitting (escisión)',
      'Pasivo-agresividad',
      'Idealización',
      'Acting out',
      'Negación',
      'Fantasía evasiva',
      'Disociación profunda',
      'Regresión',
    ];
  }
  if (tab === 'riesgos') {
    return [
      'Ideación suicida',
      'Plan suicida',
      'Intentos previos',
      'Acceso a medios de autosión',
      'Desesperanza o inutilidad expresada',
      'Consumo de sustancias',
      'Aislamiento social',
      'Autolesiones',
      'Violencia / impulsividad',
      'Agitación o ansiedad elevada',
      'Defensas desadaptativas predominantes',
      'Factores psicosociales de vulnerabilidad',
    ];
  }
  return [];
}

function colorMeta(colorId) {
  return NOTE_COLORS.find((c) => c.id === colorId) || NOTE_COLORS[0];
}

function kindleNoteHtml(note, fallbackInitials) {
  const color = note.color || note.note_type || 'teal';
  const starred = Boolean(note.starred);
  const initials = note.author_initials || fallbackInitials || '—';
  const kind = note.kind || 'comment';
  const quote = note.quote_text || '';
  const source = note.source_label || '';
  const showQuote = kind === 'annotation' && quote;

  const paletteDots = NOTE_COLORS.map(
    (c) =>
      `<button type="button" class="kindle-note__palette-dot${c.id === color ? ' active' : ''}" data-color="${c.id}" title="${escapeHtml(c.label)}" style="background:var(--note-${c.id})"></button>`,
  ).join('');

  return `
    <article class="kindle-note kindle-note--${escapeHtml(color)}${starred ? ' kindle-note--starred' : ''}" data-id="${note.id}" data-color="${escapeHtml(color)}">
      <div class="kindle-note__body">
        ${source ? `<p class="kindle-note__source">${escapeHtml(source)}</p>` : ''}
        ${showQuote ? `<blockquote class="kindle-note__quote"><span class="kindle-note__quote-mark">“</span>${escapeHtml(quote)}</blockquote>` : ''}
        ${showQuote ? '<hr class="kindle-note__rule" />' : ''}
        <textarea class="kindle-note__comment" data-note-id="${note.id}" placeholder="${showQuote ? 'Tu comentario sobre la cita…' : 'Escribe un comentario…'}">${escapeHtml(note.content || '')}</textarea>
      </div>
      <div class="kindle-note__rail">
        <button type="button" class="kindle-note__rail-btn note-star${starred ? ' active' : ''}" title="Destacar nota" aria-pressed="${starred}">★</button>
        <span class="kindle-note__rail-btn kindle-note__author" title="Autor/a de la nota">${escapeHtml(initials)}</span>
        <button type="button" class="kindle-note__rail-btn note-palette" title="Cambiar color de la nota">🎨</button>
        <div class="kindle-note__palette-pop" hidden>${paletteDots}</div>
        <button type="button" class="kindle-note__rail-btn note-delete" title="Eliminar nota">×</button>
      </div>
    </article>`;
}

function bindNoteCards(listEl, rerender) {
  ensurePaletteClose();
  listEl.querySelectorAll('.kindle-note').forEach((card) => {
    const id = Number(card.dataset.id);
    const ta = card.querySelector('.kindle-note__comment');

    const readFields = () => ({
      content: ta?.value ?? '',
      color: card.dataset.color || 'teal',
      starred: card.classList.contains('kindle-note--starred'),
      quoteText: card.querySelector('.kindle-note__quote')?.textContent?.replace(/^“/, '')?.trim() ?? '',
      sourceLabel: card.querySelector('.kindle-note__source')?.textContent?.trim() ?? '',
    });

    const save = debounce(async () => {
      const f = readFields();
      await updateClinicalNote(id, f);
    }, 400);

    ta?.addEventListener('input', save);

    card.querySelector('.note-star')?.addEventListener('click', async () => {
      const next = !card.classList.contains('kindle-note--starred');
      card.classList.toggle('kindle-note--starred', next);
      card.querySelector('.note-star')?.classList.toggle('active', next);
      const f = readFields();
      f.starred = next;
      await updateClinicalNote(id, f);
      await rerender();
    });

    card.querySelector('.note-delete')?.addEventListener('click', async () => {
      await deleteClinicalNote(id);
      await rerender();
    });

    const pop = card.querySelector('.kindle-note__palette-pop');
    card.querySelector('.note-palette')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = pop.hasAttribute('hidden');
      document.querySelectorAll('.kindle-note__palette-pop').forEach((p) => p.setAttribute('hidden', ''));
      if (hidden) pop.removeAttribute('hidden');
      else pop.setAttribute('hidden', '');
    });

    pop?.querySelectorAll('.kindle-note__palette-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const c = dot.dataset.color;
        card.className = `kindle-note kindle-note--${c}${card.classList.contains('kindle-note--starred') ? ' kindle-note--starred' : ''}`;
        card.dataset.color = c;
        pop.setAttribute('hidden', '');
        save();
      });
    });
  });

}

let paletteCloseBound = false;
function ensurePaletteClose() {
  if (paletteCloseBound) return;
  paletteCloseBound = true;
  document.addEventListener('click', () => {
    document.querySelectorAll('.kindle-note__palette-pop').forEach((p) => p.setAttribute('hidden', ''));
  });
}
