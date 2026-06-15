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
import { spaceCheckDescription } from '../space-check-descriptions.js';
import { loadProfile } from '../profile.js';
import { escapeHtml, practitionerInitials, toast } from '../utils.js';
import { resolveAiConfig } from '../ai-config.js';
import { chatCompletion } from '../ai-client.js';
import { buildCaseContextText } from '../export-case-context.js';
import { mountWorkspaceToolsTab } from './workspace-tools-menu.js';

const PERFIL_SECTIONS = [
  { id: 'fortalezas', label: 'Fortalezas' },
  { id: 'defensas', label: 'Defensas' },
  { id: 'riesgos', label: 'Debilidades' },
];

export async function mountNotesPanel(container, treatmentId, toolsOpts = {}) {
  let refreshList = async () => {};
  let activeTab = 'notas';
  const profile = loadProfile();
  const defaultInitials = practitionerInitials(profile.name);

  container.innerHTML = `
    <div class="space-tools" data-active-tab="notas">
      <nav class="space-tools__tabs2" role="tablist">
        ${[
          ['notas', 'Notas'],
          ['perfil', 'Perfil'],
          ['herramientas', 'Herramientas'],
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
          <input type="text" class="input ai-dock__input" id="ai-dock-input" placeholder="Pregunta a la IA sobre el caso" />
          <button type="button" class="btn btn-primary" id="ai-dock-send">Consultar</button>
        </div>
        <p class="ai-dock__hint" id="ai-dock-hint" hidden></p>
      </aside>
    </div>`;

  const listEl = container.querySelector('#notes-list');

  refreshList = async () => {
    if (activeTab === 'notas') {
      const all = await getClinicalNotes(treatmentId);
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

    if (activeTab === 'perfil') {
      await renderPerfilTab(listEl, treatmentId, profile, refreshList);
      return;
    }

    if (activeTab === 'herramientas') {
      mountWorkspaceToolsTab(listEl, { treatmentId, ...toolsOpts });
    }
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

  const aiInput = container.querySelector('#ai-dock-input');
  const aiSend = container.querySelector('#ai-dock-send');
  const aiHint = container.querySelector('#ai-dock-hint');
  const aiCfg = resolveAiConfig(profile);

  if (!aiCfg.enabled) {
    aiInput.disabled = true;
    aiSend.disabled = true;
    aiHint.textContent = 'Activa el asistente IA en Ajustes → Proveedor de IA.';
    aiHint.hidden = false;
  } else {
    const sendAiQuestion = async () => {
      const q = aiInput.value.trim();
      if (!q) return;
      aiInput.disabled = true;
      aiSend.disabled = true;
      aiSend.textContent = 'Consultando';
      try {
        const context = await buildCaseContextText(treatmentId);
        const { text } = await chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente clínico de apoyo al psicoterapeuta. Responde de forma concisa y fundamentada. Evita listas con asteriscos; usa texto corrido o numeración. Contexto del caso:\n\n' +
                context,
            },
            { role: 'user', content: q },
          ],
          maxTokens: 800,
        });
        await addClinicalNote(treatmentId, {
          kind: 'ia_answer',
          color: 'teal',
          content: text,
          authorInitials: 'IA',
          sourceLabel: q,
        });
        aiInput.value = '';
        await refreshList();
      } catch (err) {
        await addClinicalNote(treatmentId, {
          kind: 'ia_answer',
          color: 'yellow',
          content: err.message || 'Error al consultar la IA.',
          authorInitials: 'IA',
          sourceLabel: q,
        });
        await refreshList();
      } finally {
        aiInput.disabled = false;
        aiSend.disabled = false;
        aiSend.textContent = 'Consultar';
      }
    };

    aiSend.addEventListener('click', sendAiQuestion);
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiQuestion();
      }
    });
  }

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

async function renderPerfilTab(listEl, treatmentId, profile, rerender) {
  const aiCfg = resolveAiConfig(profile);
  listEl.innerHTML = `
    <div class="perfil-panel">
      <button type="button" class="btn btn-secondary btn-sm btn-block" id="btn-analyze-perfil" ${aiCfg.enabled ? '' : 'disabled'}>
        Analizar perfil con IA
      </button>
      ${aiCfg.enabled ? '' : '<p class="perfil-panel__hint">Activa el asistente IA en Ajustes para usar esta función.</p>'}
      <div id="perfil-sections"></div>
    </div>`;

  const sectionsHost = listEl.querySelector('#perfil-sections');
  await renderPerfilSections(sectionsHost, treatmentId);

  listEl.querySelector('#btn-analyze-perfil')?.addEventListener('click', async () => {
    const btn = listEl.querySelector('#btn-analyze-perfil');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Analizando…';
    try {
      await analyzeProfileWithAi(treatmentId);
      await renderPerfilSections(sectionsHost, treatmentId);
      toast('Perfil actualizado según el análisis de IA');
    } catch (err) {
      toast(err.message || 'No se pudo analizar el perfil');
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

async function renderPerfilSections(host, treatmentId) {
  const html = await Promise.all(
    PERFIL_SECTIONS.map(async (sec) => {
      const labels = sortLabels(defaultsFor(sec.id));
      const existing = await getSpaceChecks(treatmentId, sec.id);
      const map = new Map(existing.map((r) => [r.label, Number(r.checked) === 1]));
      const checkedCount = labels.filter((l) => map.get(l)).length;
      const items = labels
        .map((label) => {
          const checked = map.get(label) || false;
          const desc = spaceCheckDescription(sec.id, label);
          return `
          <label class="space-check">
            <input type="checkbox" data-space-check data-category="${sec.id}" value="${escapeHtml(label)}" ${checked ? 'checked' : ''}/>
            <span class="space-check__body">
              <span class="space-check__title">${escapeHtml(label)}</span>
              ${desc ? `<span class="space-check__desc">${escapeHtml(desc)}</span>` : ''}
            </span>
          </label>`;
        })
        .join('');

      return `
        <details class="perfil-section" open>
          <summary class="perfil-section__head">
            <span class="perfil-section__title">${escapeHtml(sec.label)}</span>
            <span class="perfil-section__count">${checkedCount}/${labels.length}</span>
          </summary>
          <div class="space-checklist">${items}</div>
        </details>`;
    }),
  );
  host.innerHTML = html.join('');

  host.querySelectorAll('[data-space-check]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      await setSpaceCheck(treatmentId, cb.dataset.category, cb.value, cb.checked);
      const section = cb.closest('.perfil-section');
      const boxes = section?.querySelectorAll('[data-space-check]');
      const count = section?.querySelector('.perfil-section__count');
      if (boxes && count) {
        const n = [...boxes].filter((x) => x.checked).length;
        count.textContent = `${n}/${boxes.length}`;
      }
    });
  });
}

async function analyzeProfileWithAi(treatmentId) {
  const context = await buildCaseContextText(treatmentId);
  const lists = Object.fromEntries(
    PERFIL_SECTIONS.map((s) => [s.id === 'riesgos' ? 'debilidades' : s.id, sortLabels(defaultsFor(s.id))]),
  );

  const { text } = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: `Eres psicólogo clínico. Según el contexto del caso, marca qué ítems aplican del paciente actual.
Responde SOLO JSON válido sin markdown:
{"fortalezas":["..."],"defensas":["..."],"debilidades":["..."]}
Usa exactamente los nombres de las listas proporcionadas. Incluye solo ítems con evidencia en el contexto.`,
      },
      {
        role: 'user',
        content: `Contexto del caso:\n${context}\n\nFortalezas posibles:\n${lists.fortalezas.join('\n')}\n\nDefensas posibles:\n${lists.defensas.join('\n')}\n\nDebilidades posibles:\n${lists.debilidades.join('\n')}`,
      },
    ],
    maxTokens: 1200,
  });

  const parsed = parseProfileAiJson(text);
  const apply = async (category, labels) => {
    const allowed = new Set(defaultsFor(category));
    for (const label of labels || []) {
      if (allowed.has(label)) {
        await setSpaceCheck(treatmentId, category, label, true);
      }
    }
  };

  await apply('fortalezas', parsed.fortalezas);
  await apply('defensas', parsed.defensas);
  await apply('riesgos', parsed.debilidades || parsed.riesgos);
}

function parseProfileAiJson(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('La IA no devolvió un formato válido');
  }
}

function sortLabels(labels) {
  return [...labels].sort((a, b) => a.localeCompare(b, 'es'));
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

function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function kindleNoteHtml(note, fallbackInitials) {
  const color = note.color || note.note_type || 'teal';
  const starred = Boolean(note.starred);
  const initials = note.author_initials || fallbackInitials || '—';
  const kind = note.kind || 'comment';
  const quote = note.quote_text || '';
  const source = note.source_label || '';
  const showQuote = kind === 'annotation' && quote;
  const isAi = kind === 'ia_answer';

  const paletteDots = NOTE_COLORS.map(
    (c) =>
      `<button type="button" class="kindle-note__palette-dot${c.id === color ? ' active' : ''}" data-color="${c.id}" title="${escapeHtml(c.label)}" style="background:var(--note-${c.id})"></button>`,
  ).join('');

  const bodyContent = isAi
    ? `
        ${source ? `<p class="kindle-note__source kindle-note__source--question">${escapeHtml(source)}</p>` : ''}
        <div class="kindle-note__ai-answer">${renderMarkdown(note.content || '')}</div>`
    : `
        ${source ? `<p class="kindle-note__source">${escapeHtml(source)}</p>` : ''}
        ${showQuote ? `<blockquote class="kindle-note__quote"><span class="kindle-note__quote-mark">"</span>${escapeHtml(quote)}</blockquote>` : ''}
        ${showQuote ? '<hr class="kindle-note__rule" />' : ''}
        <textarea class="kindle-note__comment" data-note-id="${note.id}" placeholder="${showQuote ? 'Tu comentario sobre la cita…' : 'Escribe un comentario…'}">${escapeHtml(note.content || '')}</textarea>`;

  return `
    <article class="kindle-note kindle-note--${escapeHtml(color)}${starred ? ' kindle-note--starred' : ''}${isAi ? ' kindle-note--ia' : ''}" data-id="${note.id}" data-color="${escapeHtml(color)}" data-kind="${kind}">
      <div class="kindle-note__body">
        ${bodyContent}
      </div>
      <div class="kindle-note__rail">
        <button type="button" class="kindle-note__rail-btn note-star${starred ? ' active' : ''}" title="Destacar nota" aria-pressed="${starred}">★</button>
        <span class="kindle-note__rail-btn kindle-note__author" title="${isAi ? 'Respuesta IA' : 'Autor/a de la nota'}">${escapeHtml(initials)}</span>
        ${!isAi ? `<button type="button" class="kindle-note__rail-btn note-palette" title="Cambiar color de la nota">🎨</button>
        <div class="kindle-note__palette-pop" hidden>${paletteDots}</div>` : ''}
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
      quoteText: card.querySelector('.kindle-note__quote')?.textContent?.replace(/^"/, '')?.trim() ?? '',
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
        card.className = `kindle-note kindle-note--${c}${card.classList.contains('kindle-note--starred') ? ' kindle-note--starred' : ''}${card.dataset.kind === 'ia_answer' ? ' kindle-note--ia' : ''}`;
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
